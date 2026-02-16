import { Router } from 'express';

export function createResourcesRouter(mcpManager) {
  const router = Router();

  router.get('/', async (req, res) => {
    const { uri } = req.query;

    if (!uri) {
      return res.status(400).json({ error: 'uri query parameter is required' });
    }

    // Parse server ID from URI: ui://serverId/resourcePath
    let serverId;
    if (uri.startsWith('ui://')) {
      const uriParts = uri.replace('ui://', '').split('/');
      serverId = uriParts[0];
    } else {
      return res.status(400).json({ error: 'Only ui:// URIs are supported' });
    }

    try {
      const result = await mcpManager.getResourceContent(serverId, uri);
      const content = result.contents?.[0];
      if (!content) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      res.json({
        uri,
        mimeType: content.mimeType,
        text: content.text,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
