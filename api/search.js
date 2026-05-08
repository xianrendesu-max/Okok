const { Innertube } = require('youtubei.js');
const cors = require('cors');

const corsHandler = cors({
    origin: '*',
    methods: ['GET', 'OPTIONS'],
});

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
        const yt = await Innertube.create();

        // 1. 動画詳細リクエスト (コメント・関連動画)
        if (videoId) {
            const info = await yt.getInfo(videoId);
            
            // コメントの取得
            let comments = [];
            try {
                const threads = await info.getComments();
                comments = threads.contents.map(c => ({
                    text: c.content?.toString() || "",
                    author: c.author?.name || "Anonymous",
                    authorIcon: c.author?.thumbnails?.[0]?.url || "",
                    published: c.published || ""
                }));
            } catch (ce) {
                console.log("Comments not available");
            }

            // 関連動画の取得
            const related = info.watch_next_feed?.results?.map(v => ({
                id: v.id,
                title: v.title?.toString(),
                author: v.author?.name,
                thumbnail: v.thumbnails?.[0]?.url,
                views: v.view_count?.toString() || ""
            })).filter(v => v.id) || [];

            return res.status(200).json({
                title: info.basic_info.title,
                author: info.basic_info.author,
                channelIcon: info.basic_info.channel?.thumbnails?.[0]?.url || "",
                comments: comments.slice(0, 20),
                related: related.slice(0, 15)
            });
        }

        // 2. 通常の検索リクエスト
        if (!q) {
            return res.status(400).json({ error: 'Query parameter required' });
        }

        const searchResults = await yt.search(q, { type: 'video' });
        const videos = searchResults.videos.map((v) => {
            return {
                id: v.id,
                title: v.title?.text || v.title || 'No Title',
                thumbnail: v.thumbnails?.[0]?.url || '',
                author: v.author?.name || v.author || 'Unknown',
                channelIcon: v.author?.thumbnails?.[0]?.url || '',
                views: v.view_count?.text || v.short_view_count?.text || '0回',
                duration: v.duration?.text || '0:00',
                published: v.published?.text || ''
            };
        });

        res.status(200).json(videos);

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};
