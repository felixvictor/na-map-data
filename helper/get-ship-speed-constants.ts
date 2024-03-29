import path from "node:path"
import { linearRegression } from "simple-statistics"

import type { APIItemGeneric, APIShip } from "../src/@types/api-item.js"
import { compressExt, unCompressSync } from "../src/common/compress.js"
import { baseAPIFilename, readJson, removeFileSync } from "../src/common/file.js"
import { serverIds } from "../src/common/servers.js"
import { currentServerStartDate as serverDate } from "../src/common/time.js"

interface InGameSpeed {
    id: number
    name: string
    maxSpeed: number
}

const fileNameAPIItems = path.resolve(baseAPIFilename, `${serverIds[0]}-ItemTemplates-${serverDate}.json`)
unCompressSync(`${fileNameAPIItems}.${compressExt}`)
const apiItems = readJson<APIItemGeneric[]>(fileNameAPIItems)
removeFileSync(fileNameAPIItems)

const apiSpeedMap = new Map(
    (apiItems.filter((item: APIItemGeneric) => item.ItemType === "Ship") as unknown as APIShip[]).map(
        (ship: APIShip) => [Number(ship.Id), ship.Specs.MaxSpeed],
    ),
)

const inGameSpeedJson = readJson<InGameSpeed[]>(path.resolve("helper", "ship-speed.json"))

//const selectedShips = new Set([272, 274, 278, 287, 650, 768, 1021, 1664])

const data: number[][] = inGameSpeedJson
    //.filter((ship) => selectedShips.has(ship.id))
    .map((ship) => [apiSpeedMap.get(ship.id) as number, ship.maxSpeed])

const linearReg = linearRegression(data)
console.log(linearReg)
