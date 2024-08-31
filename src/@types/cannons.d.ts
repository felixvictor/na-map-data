import type { cannonType, peneDistance } from "./constants.js"

export type CannonType = (typeof cannonType)[number]
export type CannonTypeList<T> = {
    [K in CannonType]: T
}
export type CannonFamily = string
export type PeneDistance = (typeof peneDistance)[number]

type Cannon = {
    [K in CannonType]: CannonEntity[]
}
export interface CannonEntity {
    name: string
    family: CannonFamily
    damage: CannonDamage
    generic: CannonGeneric
    penetration: CannonPenetration
}
export type CannonElementIndex = CannonValue | undefined
export interface CannonDamage {
    basic: CannonValue
    "reload time": CannonValue
    splinter: CannonValue
    "per second": CannonValue
    penetration?: CannonValue
}
export interface CannonTraverse {
    up: CannonValue
    down: CannonValue
}
export interface CannonDispersion {
    horizontal: CannonValue
    vertical: CannonValue
}
export interface CannonGeneric {
    weight: CannonValue
    crew: CannonValue
}
export type CannonPenetration = Record<number, CannonValue>
export interface CannonValue {
    value: number
    digits?: number
}
