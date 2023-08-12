export interface Group {
    group: string
    data: Line[]
}

export interface Line {
    label: string
    data: Segment[]
}

export interface Segment {
    timeRange: [TS, TS]
    val: Val
}

export type TS = Date | number

export type Val = number | string

export interface Ownership {
    region: string
    data: Group[]
}

export interface Port {
    name: string
    region: string
    county: string
    data: Segment[]
    id?: string
}

export type RegionGroup = Map<string, CountyGroup>
export type CountyGroup = Map<string, Port[]>
