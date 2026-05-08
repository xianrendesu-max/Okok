const { Innertube, UniversalCache } = require('youtubei.js');
const cors = require('cors');

const corsHandler = cors({
    origin: '*',
    methods: ['GET', 'OPTIONS'],
});

// youtubei.js特有の構造からテキストを抽出する高度なヘルパー
const getText = (obj) => {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    if (obj.text) return obj.text;
    if (Array.isArray(obj.runs)) return obj.runs.map(r => r.text).join('');
    if (obj.simple_text) return obj.simple_text;
    return obj.toString() || '';
};

module.exports = async (req, res) => {
    await new Promise((resolve, reject) => {
        corsHandler(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { q, videoId } = req.query;

    try {
        const yt = await Innertube.create({
            cache: new UniversalCache(false),
            generate_session_locally: true
        });

        // 1. 動画詳細リクエスト (再生ページ用)
        if (videoId) {
            // getInfoに加えて、関連動画を確実に取るためにリクエスト
            const info = await yt.getInfo(videoId);
            
            // A. ストリーム
            const dash_url = info.streaming_data?.dash_manifest_url || null;
            const hls_url = info.streaming_data?.hls_manifest_url || null;

            // B. コメントの取得
            let comments = [];
            try {
                const commentData = await info.getComments();
                // 複数のプロパティからコンテンツを探索
                const contents = commentData.contents || commentData.items || [];
                comments = contents.map(c => ({
                    text: getText(c.content || c.text),
                    author: c.author?.name || getText(c.author),
                    authorIcon: c.author?.thumbnails?.[0]?.url || "",
                    published: c.published_time?.text || c.published || "",
                    likes: c.like_count || "0"
                })).filter(c => c.text !== "");
            } catch (ce) {
                console.log("Comments fetching failed");
            }

            // C. 関連動画の取得 (watch_next_feedを優先し、代替としてrelated_videosを使用)
            let related = [];
            try {
                const relatedResults = info.watch_next_feed?.results || info.related_videos || [];
                related = relatedResults.map(v => {
                    const id = v.id || v.video_id;
                    if (!id) return null;
                    return {
                        id: id,
                        title: getText(v.title),
                        author: v.author?.name || getText(v.author) || "Unknown",
                        thumbnail: v.thumbnails?.[0]?.url || (v.thumbnail?.url) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                        views: v.view_count?.text || v.short_view_count?.text || ""
                    };
                }).filter(v => v !== null);
            } catch (re) {
                console.log("Related videos fetching failed");
            }

            // D. チャンネル詳細 (より広範囲からアイコンを取得)
            const channelIcon = 
                info.basic_info.channel?.thumbnails?.[0]?.url || 
                info.secondary_results?.owner?.author?.thumbnails?.[0]?.url || "";

            return res.status(200).json({
                id: videoId,
                title: getText(info.basic_info.title),
                description: info.basic_info.short_description,
                author: info.basic_info.author || "不明なチャンネル",
                subscribers: info.basic_info.channel?.subscribers || "登録者数非公開",
                channelIcon: channelIcon,
                comments: comments.slice(0, 30),
                related: related.slice(0, 20),
                streaming: {
                    dash: dash_url,
                    hls: hls_url
                }
            });
        }

        // 2. 通常の検索リクエスト
        if (!q) {
            return res.status(400).json({ error: 'Query parameter "q" or "videoId" required' });
        }

        const searchResults = await yt.search(q, { type: 'video' });
        const videos = searchResults.videos.map((v) => {
            if (v.type !== 'Video') return null;
            return {
                id: v.id,
                title: getText(v.title),
                thumbnail: v.thumbnails?.[0]?.url || '',
                author: v.author?.name || 'Unknown',
                channelIcon: v.author?.thumbnails?.[0]?.url || '',
                views: v.view_count?.text || v.short_view_count?.text || '0',
                duration: v.duration?.text || '0:00',
                published: v.published?.text || ''
            };
        }).filter(v => v !== null);

        res.status(200).json(videos);

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ 
            error: 'Internal Server Error', 
            details: error.message 
        });
    }
};
