import { group as d3Group } from "d3-array"
import path from "node:path"

import { getCommonPaths } from "./common/path.js"
import { cleanName } from "./common/api.js"
import { sortBy } from "./common/sort.js"
import { saveJsonAsync } from "./common/file.js"
import { compressExt } from "./common/compress.js"
import { capitalToCounty } from "./common/constants.js"
import { findNationShortNameById, nationShortNamesPerServer } from "./common/nation.js"
import type { Group, Line, Ownership, Port, RegionGroup, Segment } from "./@types/ownership.js"
import type { APIPort } from "./@types/api-port.js"
import type { NationShortName, OwnershipNation } from "./@types/nations.js"
import type { PowerMapList } from "./@types/power-map.js"
import type { ServerId } from "./@types/server.js"
import type { NationList } from "./@types/nations.js"

export class PortOwnership {
    #currentPort = {} as APIPort
    #numPortsPerNationPerDates = [] as Array<OwnershipNation<number>>
    #portOwnershipPerDate = [] as PowerMapList
    #ports = new Map<string, Port>()
    currentDate = ""
    fileBaseNameRegex = {} as RegExp
    readonly commonPaths = getCommonPaths()
    readonly #nationsCurrentServer = [] as NationShortName[]
    readonly serverId = "" as ServerId
    readonly fileExtension = `.json.${compressExt}`

    constructor(serverId: ServerId) {
        this.serverId = serverId
        this.fileBaseNameRegex = new RegExp(`${serverId}-Ports-(20(\\d{2})-(\\d{2})-(\\d{2}))${this.fileExtension}`)
        this.#nationsCurrentServer = nationShortNamesPerServer.get(serverId) ?? []
    }

    set numPortsPerNationPerDates(numPortsPerNationPerDates: Array<OwnershipNation<number>>) {
        this.#numPortsPerNationPerDates = numPortsPerNationPerDates
    }

    set portOwnershipPerDate(portOwnershipPerDate: PowerMapList) {
        this.#portOwnershipPerDate = portOwnershipPerDate
    }

    set ports(ports: Map<string, Port>) {
        this.#ports = ports
    }

    #getUnixTimestamp(date: string): number {
        return new Date(date).getTime()
    }

    #getNewSegment(): Segment {
        const dateF = this.#getUnixTimestamp(this.currentDate)
        return {
            timeRange: [dateF, dateF],
            val: findNationShortNameById(this.#currentPort.Nation),
        }
    }

    #initData(): void {
        this.#ports.set(this.#currentPort.Id, {
            name: cleanName(this.#currentPort.Name),
            region: this.#currentPort.Location,
            county: capitalToCounty.get(this.#currentPort.CountyCapitalName) ?? "",
            data: [this.#getNewSegment()],
        })
    }

    #getPreviousNation(): NationShortName | "" {
        const portData = this.#ports.get(this.#currentPort.Id)
        // console.log("#getPreviousNation", this.serverId, this.#currentPort.Id, portData)
        if (portData) {
            const index = portData.data.length - 1 ?? 0
            return portData.data[index].val as NationShortName
        }

        return ""
    }

    #setNewNation(): void {
        // console.log("setNewNation -> ", ports.get(currentPort.Id));
        const portData = this.#ports.get(this.#currentPort.Id)
        if (portData) {
            portData.data.push(this.#getNewSegment())
            this.#ports.set(this.#currentPort.Id, portData)
        }
    }

    #setNewEndDate(): void {
        const portData = this.#ports.get(this.#currentPort.Id)
        // console.log("#setNewEndDate", portData)
        if (portData) {
            // console.log("setNewEndDate -> ", ports.get(currentPort.Id), values);
            portData.data[portData.data.length - 1].timeRange[1] = this.#getUnixTimestamp(this.currentDate)
            this.#ports.set(this.#currentPort.Id, portData)
        }
    }

    #setTimeline(currentNation: string) {
        if (this.#ports.get(this.#currentPort.Id)) {
            const oldNation = this.#getPreviousNation()
            if (currentNation === oldNation) {
                this.#setNewEndDate()
            } else {
                this.#setNewNation()
            }
        } else {
            this.#initData()
        }
    }

    /**
     * Parse data and construct ports Map
     */
    parseData(apiPorts: APIPort[]) {
        // console.log("**** new currentDate", currentDate);

        const nationPerPorts = [] as number[]
        const numPortsPerNation = {} as NationList<number>
        for (const nationShortname of this.#nationsCurrentServer) {
            numPortsPerNation[nationShortname] = 0
        }

        // Loop all ports excluding free towns
        for (this.#currentPort of apiPorts.filter((apiPort) => apiPort.Nation !== 9)) {
            const currentNation = findNationShortNameById(this.#currentPort.Nation)
            numPortsPerNation[currentNation] = Number(numPortsPerNation[currentNation]) + 1
            nationPerPorts.push(this.#currentPort.Nation)
            this.#setTimeline(currentNation)
        }

        // console.log(serverId, currentDate, nationPerPorts.length)
        this.#portOwnershipPerDate.push([this.currentDate, nationPerPorts])

        const numPortsDate = {} as OwnershipNation<number>
        numPortsDate.date = this.currentDate
        for (const nationShortname of this.#nationsCurrentServer) {
            numPortsDate[nationShortname] = numPortsPerNation[nationShortname]
        }

        this.#numPortsPerNationPerDates.push(numPortsDate)
        // console.log("**** 138 -->", [serverId], ports[serverId].get("138"));
    }

    #getTimelineGroup() {
        const groups = d3Group<Port, string, string>(
            [...this.#ports.values()],
            (d) => d.region,
            (d) => d.county,
        ) as RegionGroup

        // Convert to data structure needed for timelines-chart
        // region
        // -- group (counties)
        //    -- label (ports)
        return [...groups]
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
    }

    async writeResult() {
        await saveJsonAsync(
            path.resolve(this.commonPaths.dirGenServer, `${this.serverId}-ownership.json`),
            this.#getTimelineGroup(),
        )
        await saveJsonAsync(
            path.resolve(this.commonPaths.dirGenServer, `${this.serverId}-nation.json`),
            this.#numPortsPerNationPerDates,
        )
        await saveJsonAsync(
            path.resolve(this.commonPaths.dirGenServer, `${this.serverId}-power.json`),
            this.#portOwnershipPerDate,
        )
    }
}
