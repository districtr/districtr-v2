import { PMTiles } from "pmtiles"
import { CACHE, getSource, nativeDecompress } from "./utils"

export type tileReqParams = {
  params: {
    args: [string, string, string, string]
  }
}
export async function GET(_request: Request, reqParams: tileReqParams) {
  // get the tilesArgs from the request object
  const tileArgs = reqParams.params.args
  if (!tileArgs || tileArgs.length < 4 || tileArgs.some((a) => typeof a !== "string")) {
    return Response.json(
      "Invalid tileset request. Please provide your tileset request as endpoint/{tileset}/{z}/{x}/{y}",
      { status: 400 }
    )
  }
  const [name, z, x, y] = tileArgs

  const source = getSource(name)
  const p = new PMTiles(source, CACHE, nativeDecompress)
  const pHeader = await p.getHeader()
  if (+z < pHeader.minZoom || +z > pHeader.maxZoom) {
    return Response.json("Tile outside bounds", { status: 404 })
  }
  const tiledata = await p.getZxy(+z, +x, +y)

  if (!tiledata) {
    return Response.json("Tile not found", { status: 404 })
  }
  // return the tile data as image/x-protobuf
  return new Response(tiledata.data, {
    headers: {
      "Content-Type": "image/x-protobuf",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
