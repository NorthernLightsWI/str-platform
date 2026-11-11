// Vendor-neutral thermostat adapter interface.
// All reconcile logic talks only to this — swap the implementation by changing the factory.

export interface SeamDevice {
  seam_device_id: string
  display_name   : string
  device_type    : string
  online         : boolean
  capabilities   : Record<string, unknown>
}

export interface DeviceState {
  seam_device_id              : string
  online                      : boolean
  hvac_mode_setting           : string | null
  heating_set_point_fahrenheit: number | null
  cooling_set_point_fahrenheit: number | null
  active_climate_preset_key   : string | null
}

export interface CreateScheduleParams {
  device_id         : string
  climate_preset_key: string
  starts_at         : string   // ISO 8601
  ends_at           : string   // ISO 8601
  name             ?: string
}

export interface ThermostatProvider {
  listDevices(): Promise<SeamDevice[]>
  getState(deviceId: string): Promise<DeviceState>
  setPreset(deviceId: string, presetKey: string): Promise<void>
  createSchedule(params: CreateScheduleParams): Promise<string>   // returns seam_schedule_id
  deleteSchedule(seamScheduleId: string): Promise<void>
}
