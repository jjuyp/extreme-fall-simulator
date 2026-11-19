import { AIR_DENSITY, GRAVITY, STEP, WATER_DENSITY, weatherProfiles, type Settings } from './config.ts'

export interface Vec { x: number; y: number; z: number }
export const magnitude = ({x, y, z}: Vec) => Math.hypot(x, y, z)
export const relative = (v: Vec, fluid: Vec): Vec => ({ x: v.x - fluid.x, y: v.y - fluid.y, z: v.z - fluid.z })
export function drag(v: Vec, density: number, coefficientArea: number): Vec {
  const factor = -.5 * density * coefficientArea * magnitude(v)
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor }
}
export function windAt(settings: Settings, time: number): Vec {
  const profile = weatherProfiles[settings.weather]
  const angle = settings.direction * Math.PI / 180
  const speed = Math.max(0, settings.wind + profile.breeze + profile.gust * Math.sin(time * 1.9) * Math.cos(time * .61))
  return { x: speed * Math.sin(angle), y: profile.gust * .16 * Math.sin(time * 2.7), z: -speed * Math.cos(angle) }
}
export function airForce(v: Vec, wind: Vec, broadside: number, area: number) {
  return drag(relative(v, wind), AIR_DENSITY, area * (.48 + .62 * broadside))
}
export function waterForce(v: Vec, position: Vec, mass: number, area: number, depthFraction: number): Vec {
  const jet = Math.exp(-((position.z + 11) ** 2) / 21 - position.x ** 2 / 28)
  const flow = { x: -.45 * Math.sin(position.z * .35), y: -2.4 * jet, z: .35 + 2.1 * jet }
  const offset = relative(v, flow)
  const force = drag(offset, WATER_DENSITY, area * depthFraction)
  const limit = mass * .55 * magnitude(offset) / STEP
  const scale = Math.min(1, limit / Math.max(.001, magnitude(force)))
  return { x: force.x * scale, y: force.y * scale + WATER_DENSITY * GRAVITY * (mass / 970) * depthFraction, z: force.z * scale }
}
export function canopyForce(v: Vec, wind: Vec, heading: number, fill: number, mass: number, flare = 0): Vec {
  const offset = relative(v, wind)
  const force = drag({ x: offset.x * .45, y: offset.y, z: offset.z * .45 }, AIR_DENSITY, 18 * fill * (1 + 3.8 * flare))
  const glide = 4.4 * (1 - .65 * flare)
  return {
    x: force.x + mass * fill * .55 * (Math.sin(heading) * glide - offset.x),
    y: force.y + .5 * AIR_DENSITY * 3.4 * fill * Math.min(36, offset.x ** 2 + offset.z ** 2),
    z: force.z + mass * fill * .55 * (-Math.cos(heading) * glide - offset.z),
  }
}
