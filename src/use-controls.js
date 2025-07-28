import React, { useState, useEffect, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { useMap } from './map-provider'

export const useControls = () => {
  const { map } = useMap()
  const { center, setCenter, zoom, setZoom, onZoomChange } = zoomArgs
  // const [zoom, setZoom] = useState(map.getZoom())
  // const [center, setCenter] = useState(map.getCenter())

  const updateControlsSync = useCallback(() => {
    flushSync(() => {
      const newZoom = map.getZoom()
      const newCenter = map.getCenter()
      setZoom(newZoom)
      setCenter(newCenter)
      console.log("onzzoomchange =", onZoomChange)
      if (onZoomChange) {
        // propagate changes to parent for syncing maps
        onZoomChange({ lat: newCenter.lat, lng: newCenter.lng }, newZoom)
      }
    })
  }, [map, onZoomChange])

  useEffect(() => {
    map.on('moveend', updateControlsSync)
    return () => {
      map.off('moveend', updateControlsSync)
    }
  }, [map, updateControlsSync])

  return { center, zoom }
}
