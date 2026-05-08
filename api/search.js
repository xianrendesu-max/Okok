const { Innertube } = require('youtubei.js');
const cors = require('cors');

// CORSのミドルウェアを初期化
const corsHandler = cors({
    origin: '*', // 必要に応じて特定のドメインに制限してください
    methods: ['GET', 'OPTIONS'],
});

module.exports = async (req, res) => {
    // CORSの実行
    await new Promise((resolve, reject) => {
        corsHandler(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });

    // OPTIONSリクエスト（プリフライト）への対応
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { q } = req.query;

    if (!q) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    try {
        // YouTube API (Innertube) の初期化
        const yt = await Innertube.create();
        
        // 動画の検索実行
        const searchResults = await yt.search(q, { type: 'video' });

        // フロントエンドが必要な形式にデータを整形
        // searchResults.videos は反復可能なオブジェクト
        const videos = searchResults.videos.map((v) => {
            // 基本的な動画メタデータの抽出
            // YouTube.jsのバージョンにより構造が僅かに異なる場合があるため、安全に取得
            return {
                id: v.id,
                title: v.title?.text || v.title || 'No Title',
                thumbnail: v.thumbnails?.[0]?.url || '',
                author: v.author?.name || v.author || 'Unknown Artist',
                views: v.view_count?.text || v.short_view_count?.text || '0回',
                duration: v.duration?.text || '0:00',
                published: v.published?.text || ''
            };
        });

        // 成功レスポンスの返却
        res.status(200).json(videos);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};
