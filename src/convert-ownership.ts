import { group as d3Group } from "d3-array"
import { readdir } from "node:fs/promises"
import path from "node:path"

import { getCommonPaths } from "./common/path.js"
import { cleanName } from "./common/api.js"
import { sortBy } from "./common/sort.js"
import { readJson, removeFileASync, saveJsonAsync } from "./common/file.js"
import { serverIds } from "./common/servers.js"
import { compressExt, unCompressSync } from "./common/compress.js"
import type { ServerId } from "./common/servers.js"
import type { Group, Line, Ownership, Segment } from "./@types/ownership.js"
import type { APIPort } from "./@types/api-port.js"
import type { NationList, NationShortName, OwnershipNation } from "./@types/nations.js"
import type { PowerMapList } from "./@types/power-map.js"
import { nations } from "./common/nation.js"
import { capitalToCounty } from "./common/constants.js"

const commonPaths = getCommonPaths()
const fileExtension = `.json.${compressExt}`

type ServerIdList<T> = {
    [K in ServerId]: T
}

const ports = {} as ServerIdList<Map<string, Port>>
const portOwnershipPerDate = {} as ServerIdList<PowerMapList>
const numPortsDates = {} as ServerIdList<Array<OwnershipNation<number>>>

let serverId: ServerId
const fileBaseNameRegex = {} as ServerIdList<RegExp>
const fileNames = {} as ServerIdList<string[]>

interface Port {
    name: string
    region: string
    county: string
    data: Segment[]
    id?: string
}
type RegionGroup = Map<string, CountyGroup>
type CountyGroup = Map<string, Port[]>

/**
 * Sort file names
 * @param fileNames - File names
 * @returns Sorted file names
 */
const sortFileNames = (fileNames: string[]): string[] => {
    return fileNames.sort((a, b) => {
        const ba = path.basename(a)
        const bb = path.basename(b)
        if (ba < bb) {
            return -1
        }

        if (ba > bb) {
            return 1
        }

        return 0
    })
}

const getDate = (date: string): number => new Date(date).getTime()

/**
 * Parse data and construct ports Map
 * @param serverId - Server id
 * @param portData - Port data
 * @param date - current date
 */
function parseData(serverId: ServerId, portData: APIPort[], date: string): void {
    // console.log("**** new date", date);

    const numPorts = {} as NationList<number>
    for (const nation of nations.filter((nation) => nation.id !== 9)) {
        numPorts[nation.short] = 0
    }

    const nationsForPowerMap = []

    for (const port of portData) {
        /**
         * Get data object
         */
        const getObject = (): Segment => {
            const dateF = getDate(date)
            return {
                timeRange: [dateF, dateF],
                val: nations[port.Nation].short,
            }
        }

        /**
         * Set initial data
         */
        const initData = (): void => {
            ports[serverId].set(port.Id, {
                name: cleanName(port.Name),
                region: port.Location,
                county: capitalToCounty.get(port.CountyCapitalName) ?? "",
                data: [getObject()],
            })
        }

        /**
         * Get previous nation short name
         * @returns nation short name
         */
        const getPreviousNation = (): NationShortName | "" => {
            const portData = ports[serverId].get(port.Id)
            if (portData) {
                const index = portData.data.length - 1 ?? 0
                return portData.data[index].val as NationShortName
            }

            return ""
        }

        /**
         * Add new nation entry
         */
        const setNewNation = (): void => {
            // console.log("setNewNation -> ", ports.get(port.Id));
            const portData = ports[serverId].get(port.Id)
            if (portData) {
                portData.data.push(getObject())
                ports[serverId].set(port.Id, portData)
            }
        }

        /**
         * Change end date for current nation
         */
        const setNewEndDate = (): void => {
            const portData = ports[serverId].get(port.Id)
            if (portData) {
                // console.log("setNewEndDate -> ", ports.get(port.Id), values);
                portData.data[portData.data.length - 1].timeRange[1] = getDate(date)
                ports[serverId].set(port.Id, portData)
            }
        }

        // Exclude free towns
        if (port.Nation !== 9) {
            const currentNation = nations[port.Nation].short
            numPorts[currentNation] = Number(numPorts[currentNation]) + 1
            if (ports[serverId].get(port.Id)) {
                // console.log("ports.get(port.Id)");
                const oldNation = getPreviousNation()
                if (currentNation === oldNation) {
                    setNewEndDate()
                } else {
                    setNewNation()
                }
            } else {
                // console.log("!ports.get(port.Id)");
                initData()
            }

            nationsForPowerMap.push(port.Nation)
        }
    }

    // console.log(serverId, date, nationsForPowerMap.length)
    portOwnershipPerDate[serverId].push([date, nationsForPowerMap])

    const numPortsDate = {} as OwnershipNation<number>
    numPortsDate.date = date
    for (const nation of nations.filter((nation) => nation.id !== 9)) {
        numPortsDate[nation.short] = numPorts[nation.short]
    }

    numPortsDates[serverId].push(numPortsDate)
    // console.log("**** 138 -->", [serverId], ports[serverId].get("138"));
}

/**
 * Process all files
 * @param serverId - Server id
 * @param fileNames - File names
 * @returns Resolved promise
 */
const processFiles = async (serverId: ServerId, fileNames: string[]) => {
    for (const file of fileNames) {
        unCompressSync(file)

        const parsedFile = path.parse(file)
        const jsonFN = path.format({ dir: parsedFile.dir, name: parsedFile.name })
        const json = readJson<APIPort[]>(jsonFN)
        const currentDate = (fileBaseNameRegex[serverId].exec(path.basename(file)) ?? [])[1]
        parseData(serverId, json, currentDate)

        await removeFileASync(jsonFN)
    }
}

/**
 * Write out result
 * @param serverId - Server id
 */
const writeResult = async (serverId: ServerId): Promise<void> => {
    const groups = d3Group<Port, string, string>(
        [...ports[serverId].values()],
        (d) => d.region,
        (d) => d.county,
    ) as RegionGroup

    // Convert to data structure needed for timelines-chart
    // region
    // -- group (counties)
    //    -- label (ports)
    const grouped = [...groups]
        .map(
            ([regionKey, regionValue]) =>
                ({
                    region: regionKey,
                    data: [...regionValue]
                        .map(
                            ([countyKey, countyValue]) =>
                                ({
                                    group: countyKey,
                                    data: countyValue
                                        .map((port) => {
                                            return {
                                                label: port.name,
                                                data: port.data,
                                            } as Line
                                        })
                                        .sort(sortBy(["label"])),
                                }) as Group,
                        )
                        .sort(sortBy(["group"])),
                }) as Ownership,
        )
        .sort(sortBy(["region"]))

    await saveJsonAsync(path.resolve(commonPaths.dirGenServer, `${serverId}-ownership.json`), grouped)
    await saveJsonAsync(path.resolve(commonPaths.dirGenServer, `${serverId}-nation.json`), numPortsDates[serverId])
    await saveJsonAsync(
        path.resolve(commonPaths.dirGenServer, `${serverId}-power.json`),
        portOwnershipPerDate[serverId],
    )
}

/**
 * Retrieve port data for nation/clan ownership
 * @param serverId - Server id
 */
const convertOwnership = async (serverId: ServerId): Promise<void> => {
    ports[serverId] = new Map()
    numPortsDates[serverId] = []
    portOwnershipPerDate[serverId] = []

    try {
        const files = await readdir(commonPaths.dirAPI, { recursive: true, withFileTypes: true })
        fileNames[serverId] = files
            .filter((file) => file.isFile() && file.name.match(fileBaseNameRegex[serverId]))
            .map((file) => `${file.path}/${file.name}`)
        sortFileNames(fileNames[serverId])
        await processFiles(serverId, fileNames[serverId])
        await writeResult(serverId)
    } catch (error: unknown) {
        throw new Error(error as string)
    }
}

export const convertOwnershipData = async () => {
    for (serverId of serverIds) {
        fileBaseNameRegex[serverId] = new RegExp(`${serverId}-Ports-(20\\d{2}-\\d{2}-\\d{2})${fileExtension}`)
        await convertOwnership(serverId)
    }
}
