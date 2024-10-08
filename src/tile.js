import {
  getBandInformation,
  getChunks,
  keyToTile,
  getSelectorHash,
  getPyramidMetadata,
} from './utils'
import zarr from 'zarr-js'


const fillValue1 = 3.4028234663852886e38; // max color
const fillValue2 = 9.969209968386869e36; // black

function sumAndAverageData(array1, array2, n) {
    let summedArray = array1.slice(); // create shallow copy
    for (let i = 0; i < array1.length; i++) {
        const value1 = array1[i];
        const value2 = array2[i];
        if (value1 === fillValue1 || value1 === fillValue2) {
            summedArray[i] = fillValue1
            continue
        } else if (value2 === fillValue1 ||
                   value2 === fillValue2 ||
                   value2 === Infinity) {
            summedArray[i] = fillValue1
            continue
        } else {
            summedArray[i] = (array1[i] + array2[i]) / n
        }
    }
    return summedArray
}

function calcDifference(array1, array2) {
    let diffArray = array1.slice(); // create shallow copy
    for (let i = 0; i < array1.length; i++) {
        const value1 = array1[i];
        const value2 = array2[i];
        if (value1 === fillValue1 || value1 === fillValue2) {
          // value already a fill value
          diffArray[i] = fillValue2 // Green
          continue;
        } else if (value2 === fillValue1 || value2 === fillValue2) {
          diffArray[i] = fillValue2 // Green
        }
        else {
            diffArray[i]  = array1[i] - array2[i];
        }
    }

    return diffArray;
}

class Tile {
  constructor({
    key,
    loader,
    loaderDif,
    shape,
    chunks,
    chunksDif,
    dimensions,
    coordinates,
    bands,
    initializeBuffer,
    initializeBufferDif,
    filterValue,
  }) {
    this.key = key
    this.tileCoordinates = keyToTile(key)

    this.shape = shape
    this.chunks = chunks
    this.chunksDif = chunksDif
    this.dimensions = dimensions
    this.coordinates = coordinates
    this.bands = bands
    this.filterValue = filterValue

    this._bufferCache = null
    this._buffers = {}

    this._loading = {}
    this._ready = {}

    // diff variables
    this._bufferCacheDif = null
    this._buffersDif = {}

    this._loadingDif = {}
    this._readyDif = {}

    bands.forEach((k) => {
      this._buffers[k] = initializeBuffer()
    })
    bands.forEach((k) => {
      this._buffersDif[k] = initializeBufferDif()
    })

    this.chunkedData = {}
    this.chunkedDataDif = {}

    this._loader = loader
    this._loaderDif = loaderDif
  }


  getBuffers() {
    return this._buffers
  }

  async addChunk(orig_chunks, source, summedData) {
    // console.log("CHUNKS=", this.chunkedData) // [ 16, 128, 128 ]
    // console.log("ORIG_CHUNKS=", orig_chunks)
    const version='v2'
    let loaders
    let metadata
    let group
    try {
      await new Promise((resolve, reject) =>
        zarr(window.fetch, version).openGroup(source, (err, l, m) => {
        if (err) {
          reject(err); // Reject the promise if there's an error
        } else {
            loaders = l;
            metadata = m;
            // group = g;
            resolve(); // Resolve the promise if successful
        }}));
      // console.log("Loaders:", loaders);
      // console.log("Metadata:", metadata);
      // console.log("Group:", group)
    } catch (error) {
      console.error("Error opening zarr group:", error);
    }
    let levels, maxZoom, tileSize, crs
    ({ levels, maxZoom, tileSize, crs } = getPyramidMetadata(metadata.metadata['.zattrs'].multiscales))

    let info = ["djft"] // pass this is as selector

    const lcoordinates = {}

    let coordinateKeys = ["band"]
    // console.log("LEVELS=", levels)

    await Promise.all(
      coordinateKeys.map(
        (key) =>
        new Promise((resolve) => {
          // console.log("KEY=", `${levels[0]}/${key}`)
          loaders[`${levels[0]}/${key}`]([0], (err, chunk) => {
            // console.log("HERE")
            // console.log("chunk=", chunk)
            lcoordinates[key] = Array.from(chunk.data)
            resolve()
           })
        })
      )
    )

    // console.log("CO KEYS", lcoordinates)
    // console.log("KEY tilecoords=", this.tileCoordinates)
    let z = this.tileCoordinates[2]
    let fooData = {}
    let _loading = {}
    let _ready = {}
    let chunkedData = {}
    let variable = 'climate'
    const _loader = loaders[z + '/' + variable]

    const chunks = getChunks(
        info,
        this.dimensions,  // ["band", "month", "y", "x"]
        lcoordinates, // "n34p"...
        this.shape,   // [2,12,128,128]
        this.chunks,  // [2,12,128,128]
        this.tileCoordinates[0], // tileCoordinates = [2,2,2]
        this.tileCoordinates[1]
      )

    // loadChunk()
    const updated = await Promise.all(
      chunks.map(
        (chunk) =>
          new Promise((resolve) => {
            const key = chunk.join('.')
            if (chunkedData[key]) {
              resolve(false)
            } else {
              _loading[key] = true
              _ready[key] = new Promise((innerResolve) => {
                  _loader(chunk, (err, data) => {
                    chunkedData[key] = data
                    _loading[key] = false
                    innerResolve(true)
                    resolve(true)
                  })
              })
            }
          })
      )
    )

    let chunk = chunks[0]
    const chunkKey = chunk.join('.')
    // console.log("FOOCHUNKKEY =", chunkKey)
    let data = chunkedData[chunkKey]
    // console.log("foo data", data)
    // console.log("PRE SUM DATA", summedData)
    if (summedData === undefined) {
      summedData = data
    } else {
      summedData.data = summedData.data.map((val, i) => val + data.data[i])
    }

    return summedData;
  }  // end addChunk()




  async loadChunks(chunks, chunksDif) {
    const updated = await Promise.all(
      chunks.map(
        (chunk) =>
          new Promise((resolve) => {
            const key = chunk.join('.')
            if (this.chunkedData[key]) {
              resolve(false)
            } else {
              this._loading[key] = true
              this._ready[key] = new Promise((innerResolve) => {
                this._loader(chunk, (err, data) => {
                  this.chunkedData[key] = data
                  this._loading[key] = false
                  innerResolve(true)
                  resolve(true)
                })
              })
            }
          })
      )
    )

    const updatedDif = await Promise.all(
      chunksDif.map(
        (chunkDif) =>
          new Promise((resolve) => {
            const keyDif = chunkDif.join('.')
            if (this.chunkedDataDif[keyDif]) {
              resolve(false)
            } else {
              this._loadingDif[keyDif] = true
              this._readyDif[keyDif] = new Promise((innerResolveDif) => {
                this._loaderDif(chunkDif, (err, dataDif) => {
                  this.chunkedDataDif[keyDif] = dataDif
                  this._loadingDif[keyDif] = false
                  innerResolveDif(true)
                  resolve(true)
                })
              })
            }
          })
      )
    )

    const [result1, result2] = await Promise.all([updated, updatedDif]);
    // return updated.some(Boolean)
    return result1
  }

  async populateBuffers(chunks, chunksDif, selector, sources) {
    const updated = await this.loadChunks(chunks, chunksDif)

    console.log("sources =", sources)
    let summedData = undefined
    const nDatasets = sources.length

    for (let i=1; i < sources.length; i++) {
        const source = sources[i]
        summedData = await this.addChunk(chunks,source, summedData)
        // console.log("POST ADDING CHUNK i=", i)
        // console.log("summedData =", summedData)
    }

    this.populateBuffersSync(selector, summedData, nDatasets)

    return updated
  }

  populateBuffersSync(selector, summedData=undefined, nDatasets=undefined) {
    const bandInformation = getBandInformation(selector)

    this.bands.forEach((band) => {
      const info = bandInformation[band] || selector
        // selector = {month:1, band: "prec"}
      const chunks = getChunks(
        info,
        this.dimensions,  // ["band", "month", "y", "x"]
        this.coordinates, // [band["prec","tavg"], month[1,2,...,12]]
        this.shape,   // [2,12,128,128]
        this.chunks,  // [2,12,128,128]
        this.tileCoordinates[0], // tileCoordinates = [2,2,2]
        this.tileCoordinates[1]
      )
      const chunksDif = getChunks(
        info,
        this.dimensions,  // ["band", "month", "y", "x"]
        this.coordinates, // [band["prec","tavg"], month[1,2,...,12]]
        this.shape,   // [2,12,128,128]
        this.chunksDif,  // [2,12,128,128]
        this.tileCoordinates[0], // tileCoordinates = [2,2,2]
        this.tileCoordinates[1]
      )

      if (chunks.length !== 1) {
        throw new Error(
          `Expected 1 chunk for band '${band}', found ${
            chunks.length
          }: ${chunks.join(', ')}`
        )
      }
     const filterValue = this.filterValue.filterValue
     if (filterValue["Dif."]) {
       if (chunksDif.length !== 1) {
         throw new Error(
           `Expected 1 chunk for band '${band}', found ${
            chunks.length
            }: ${chunks.join(', ')}`
           )
         }
       }

      const chunk = chunks[0]
      const chunkKey = chunk.join('.')
      let data = this.chunkedData[chunkKey]

      const chunkDif = chunksDif[0]
      const chunkKeyDif = chunkDif.join('.')
      const dataDif = this.chunkedDataDif[chunkKeyDif]

        // console.log("POPBUFFER SUMMEDDATA", summedData)
        // console.log("nDatasets", nDatasets)
        // console.log("filterValue=",filterValue)

       if (filterValue["Dif."] && summedData !== undefined) {
                  // console.log("----- THIS IS CXALLED AND IT HSOUDL MBE")
                  data.data = sumAndAverageData(data.data, summedData.data, nDatasets)
        }
      else if (filterValue["Dif."]) {
          if (typeof dataDif === 'undefined') {
              // console.log("UNDEFINED");
          }
          else{
          data = this.chunkedData[chunkKey]
          data.data = calcDifference(this.chunkedData[chunkKey].data, this.chunkedDataDif[chunkKeyDif].data)
          // console.log("dataDif =", data.data);
          }
      } else {
        data = this.chunkedData[chunkKey]
      }

      for (let i = 0; i < data.data.length; i++) {
          let val = data.data[i];
          if ( !isFinite(val) || val > 3.420100022885679e+30) {
              data.data[i] = 3.4028234663852886e38; // black on land, red nans
          }
          //else {
          //      console.log("data[i] =", data.data[i])
          //   }
      }

      if (!data) {
        throw new Error(`Missing data for chunk: ${chunkKey}`)
      }

      let bandData = data
      if (info) {
        const indices = this.dimensions
          .map((d) => (['x', 'y'].includes(d) ? null : d))
          .map((d, i) => {
            if (info[d] === undefined) {
              return null
            } else {
              const value = info[d]
              return (
                this.coordinates[d].findIndex(
                  (coordinate) => coordinate === value
                ) % this.chunks[i]
              )
            }
          })

        bandData = data.pick(...indices)
      }

      if (bandData.dimension !== 2) {
        throw new Error(
          `Unexpected data dimensions for band: ${band}. Found ${bandData.dimension}, expected 2. Check the selector value.`
        )
      }
      this._buffers[band](bandData)
    })

    this._bufferCache = getSelectorHash(selector)
  }

  isBufferPopulated() {
    return !!this._bufferCache
  }

  isLoading() {
    return Object.keys(this._loading).some((key) => this._loading[key])
  }

  isLoadingChunks(chunks) {
    return chunks.every((chunk) => this._loading[chunk.join('.')])
  }

  async chunksLoaded(chunks, chunksDif) {
    await Promise.all(chunks.map((chunk) => this._ready[chunk.join('.')]))
    await Promise.all(chunksDif.map((chunkDif) => this._readyDif[chunkDif.join('.')]))
    return true
  }

  hasLoadedChunks(chunks) {
    return chunks.every((chunk) => this.chunkedData[chunk.join('.')])
  }

  hasPopulatedBuffer(selector) {
    return (
      !!this._bufferCache && this._bufferCache === getSelectorHash(selector)
    )
  }

  setFilterValue(filterValue) {
    this.filterValue = filterValue
    return true
  }

  getPointValues({ selector, point: [x, y] }) {
    const result = []
    const chunks = getChunks(
      selector,
      this.dimensions,
      this.coordinates,
      this.shape,
      this.chunks,
      this.tileCoordinates[0],
      this.tileCoordinates[1]
    )

    chunks.forEach((chunk) => {
      const key = chunk.join('.')
      const chunkData = this.chunkedData[key]

      if (!chunkData) {
        throw new Error(`Missing data for chunk: ${key}`)
      }

      const combinedIndices = this.chunks.reduce(
        (accum, count, i) => {
          const dimension = this.dimensions[i]
          const chunkOffset = chunk[i] * count

          if (['x', 'lon'].includes(dimension)) {
            return accum.map((prev) => [...prev, x])
          } else if (['y', 'lat'].includes(dimension)) {
            return accum.map((prev) => [...prev, y])
          } else if (selector.hasOwnProperty(dimension)) {
            const selectorValues = Array.isArray(selector[dimension])
              ? selector[dimension]
              : [selector[dimension]]
            const selectorIndices = selectorValues
              .map((value) => this.coordinates[dimension].indexOf(value))
              .filter(
                (index) => chunkOffset <= index && index < chunkOffset + count
              )

            return selectorIndices.reduce((a, index) => {
              return a.concat(accum.map((prev) => [...prev, index]))
            }, [])
          } else {
            let updatedAccum = []

            for (let j = 0; j < count; j++) {
              const index = chunkOffset + j
              updatedAccum = updatedAccum.concat(
                accum.map((prev) => [...prev, index])
              )
            }

            return updatedAccum
          }
        },
        [[]]
      )

      combinedIndices.forEach((indices) => {
        const keys = indices.reduce((accum, el, i) => {
          const coordinates = this.coordinates[this.dimensions[i]]
          const selectorValue = selector[this.dimensions[i]]

          if (
            coordinates &&
            (Array.isArray(selectorValue) || selectorValue == undefined)
          ) {
            accum.push(coordinates[el])
          }

          return accum
        }, [])
        const chunkIndices = indices.map((el, i) =>
          ['x', 'lon', 'y', 'lat'].includes(this.dimensions[i])
            ? el
            : el - chunk[i] * this.chunks[i]
        )
        result.push({
          keys,
          value: chunkData.get(...chunkIndices),
        })
      })
    })

    return result
  }
}

export default Tile
