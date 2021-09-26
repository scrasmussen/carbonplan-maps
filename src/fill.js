import { useEffect, useRef } from 'react'
import { useMapbox } from './mapbox'
import { updatePaintProperty } from './utils'
import uniqueString from 'unique-string'

const Fill = ({ source, variable, color, id, maxZoom=5, opacity=1}) => {
  const { map } = useMapbox()
  const removed = useRef(false)
  
  map.on('remove', () => {
    removed.current = true
  })

  const sourceIdRef = useRef()
  const layerIdRef = useRef()
  
  useEffect(() => {
    sourceIdRef.current = id || uniqueString()
    const { current: sourceId } = sourceIdRef
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'vector',
        tiles: [`${source}/{z}/{x}/{y}.pbf`],
      })
      if (maxZoom) {
        map.getSource(sourceId).maxzoom = maxZoom
      }
    }
  }, [id])

  useEffect(() => {
    layerIdRef.current = uniqueString()
    const { current: layerId } = layerIdRef
    const { current: sourceId } = sourceIdRef
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        'source-layer': variable,
        layout: { visibility: 'visible' },
        paint: {
          'fill-color': color,
          'fill-opacity': opacity,
        },
      })
    }

    return () => {
      if (!removed.current) {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId)
        }
      }
    }
  }, [])

  useEffect(() => {
    updatePaintProperty(map, layerIdRef, 'fill-color', color)
  }, [color])

  useEffect(() => {
    updatePaintProperty(map, layerIdRef, 'fill-opacity', opacity)
  }, [opacity])

  return null
}

export default Fill