const mapService = require('../services/mapService');

/**
 * Obtiene URL de mapa estático para coordenadas dadas
 */
exports.getStaticMap = async (req, res) => {
  try {
    const { lat, lng, zoom, width, height } = req.query;
    
    // Validar parámetros
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Se requieren latitud y longitud' });
    }
    
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedZoom = zoom ? parseInt(zoom) : 15;
    const parsedWidth = width ? parseInt(width) : 600;
    const parsedHeight = height ? parseInt(height) : 300;
    
    // Validar que los valores sean números válidos
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({ error: 'Latitud y longitud deben ser números' });
    }
    
    // Obtener URL de mapa estático (ahora es la ruta local)
    const mapUrl = await mapService.getStaticMap(
      parsedLat, 
      parsedLng, 
      parsedZoom,
      parsedWidth,
      parsedHeight
    );
    
    // Devolver la URL completa
    res.json({ 
      url: `${req.protocol}://${req.get('host')}/${mapUrl}` 
    });
  } catch (error) {
    console.error('❌ Error al obtener mapa estático:', error);
    res.status(500).json({ error: 'Error al generar mapa estático' });
  }
};

/**
 * Permite limpiar la caché de un mapa específico
 */
exports.invalidateMapCache = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Se requieren latitud y longitud' });
    }
    
    const count = await mapService.invalidateMapCache(parseFloat(lat), parseFloat(lng));
    res.json({ message: `${count} entradas de caché eliminadas` });
  } catch (error) {
    console.error('❌ Error al invalidar caché:', error);
    res.status(500).json({ error: 'Error al invalidar caché de mapas' });
  }
};