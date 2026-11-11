import { Seam } from "seam"
import type { ThermostatProvider, SeamDevice, DeviceState, CreateScheduleParams } from "./provider"

// Minimum heating set point we will ever send to Seam regardless of what the schedule asks for.
// Callers also enforce this, but we double-check here so no code path bypasses it.
const ABSOLUTE_FREEZE_FLOOR_F = 55

export class SeamThermostatProvider implements ThermostatProvider {
  private client: Seam

  constructor(apiKey: string) {
    this.client = new Seam(apiKey)
  }

  async listDevices(): Promise<SeamDevice[]> {
    const devices = await this.client.thermostats.list()
    return devices.map(d => ({
      seam_device_id: d.device_id,
      display_name  : d.display_name ?? d.device_type,
      device_type   : d.device_type,
      online        : (d.properties as any)?.online ?? false,
      capabilities  : {
        can_hvac_cool      : (d as any).can_hvac_cool       ?? false,
        can_hvac_heat      : (d as any).can_hvac_heat       ?? false,
        can_hvac_heat_cool : (d as any).can_hvac_heat_cool  ?? false,
        available_presets  : (d.properties as any)?.available_climate_presets ?? [],
      },
    }))
  }

  async getState(deviceId: string): Promise<DeviceState> {
    const d = await this.client.devices.get({ device_id: deviceId })
    const props = d.properties as any
    return {
      seam_device_id              : d.device_id,
      online                      : props?.online ?? false,
      hvac_mode_setting           : props?.current_climate_setting?.hvac_mode_setting ?? null,
      heating_set_point_fahrenheit: props?.current_climate_setting?.heating_set_point_fahrenheit ?? null,
      cooling_set_point_fahrenheit: props?.current_climate_setting?.cooling_set_point_fahrenheit ?? null,
      active_climate_preset_key   : props?.current_climate_setting?.climate_preset_key ?? null,
    }
  }

  async setPreset(deviceId: string, presetKey: string): Promise<void> {
    await this.client.thermostats.activateClimatePreset({
      device_id         : deviceId,
      climate_preset_key: presetKey,
    })
  }

  async createSchedule(params: CreateScheduleParams): Promise<string> {
    const schedule = await this.client.thermostats.schedules.create({
      device_id         : params.device_id,
      climate_preset_key: params.climate_preset_key,
      starts_at         : params.starts_at,
      ends_at           : params.ends_at,
      name              : params.name,
      is_override_allowed      : true,
      max_override_period_minutes: null,  // unlimited manual override
    })
    return schedule.thermostat_schedule_id
  }

  async deleteSchedule(seamScheduleId: string): Promise<void> {
    await this.client.thermostats.schedules.delete({
      thermostat_schedule_id: seamScheduleId,
    })
  }

  // Ensure both climate presets exist on the device, creating/updating as needed.
  async ensurePresets(params: {
    device_id    : string
    occupied_heat: number
    occupied_cool: number
    vacant_heat  : number
    vacant_cool  : number
    freeze_floor : number
  }): Promise<void> {
    const {
      device_id,
      occupied_heat, occupied_cool,
      vacant_heat,   vacant_cool,
      freeze_floor,
    } = params

    const enforcedOccHeat  = Math.max(occupied_heat, freeze_floor, ABSOLUTE_FREEZE_FLOOR_F)
    const enforcedVacHeat  = Math.max(vacant_heat,   freeze_floor, ABSOLUTE_FREEZE_FLOOR_F)

    if (enforcedOccHeat !== occupied_heat || enforcedVacHeat !== vacant_heat) {
      const floor = Math.max(freeze_floor, ABSOLUTE_FREEZE_FLOOR_F)
      throw new Error(
        `Heating set points would violate freeze floor (${floor}°F). ` +
        `occupied_heat=${occupied_heat}, vacant_heat=${vacant_heat}.`
      )
    }

    const device = await this.client.devices.get({ device_id })
    const existing: string[] = ((device.properties as any)?.available_climate_presets ?? [])
      .map((p: any) => p.climate_preset_key as string)

    const presets = [
      {
        key : "occupied",
        heat: enforcedOccHeat,
        cool: occupied_cool,
      },
      {
        key : "vacant",
        heat: enforcedVacHeat,
        cool: vacant_cool,
      },
    ]

    for (const preset of presets) {
      const body = {
        device_id         : device_id,
        climate_preset_key: preset.key,
        name              : preset.key === "occupied" ? "Occupied" : "Vacant",
        hvac_mode_setting : "heat_cool" as const,
        heating_set_point_fahrenheit: preset.heat,
        cooling_set_point_fahrenheit: preset.cool,
      }
      if (existing.includes(preset.key)) {
        await this.client.thermostats.updateClimatePreset(body)
      } else {
        await this.client.thermostats.createClimatePreset(body)
      }
    }

    // Set vacant as the fallback so the device stays in energy-save mode between schedules.
    await this.client.thermostats.setFallbackClimatePreset({
      device_id         : device_id,
      climate_preset_key: "vacant",
    })
  }
}

export function createSeamProvider(apiKey: string): ThermostatProvider {
  return new SeamThermostatProvider(apiKey)
}
