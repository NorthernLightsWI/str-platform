export type AmenityDef = {
  key     : string
  label   : string
  category: string
  impact  : 1 | 2 | 3
}

export const AMENITIES: AmenityDef[] = [
  // ── Connectivity ──────────────────────────────────────────────────────────
  { key: "wifi",                label: "WiFi",                         category: "Connectivity",     impact: 3 },
  { key: "high_speed_wifi",     label: "High-Speed WiFi (500+ Mbps)",  category: "Connectivity",     impact: 3 },
  { key: "dedicated_workspace", label: "Dedicated Workspace",          category: "Connectivity",     impact: 2 },
  { key: "smart_tv",            label: "Smart TV",                     category: "Connectivity",     impact: 2 },
  // ── Kitchen ───────────────────────────────────────────────────────────────
  { key: "full_kitchen",        label: "Full Kitchen",                 category: "Kitchen",          impact: 3 },
  { key: "coffee_maker",        label: "Coffee Maker",                 category: "Kitchen",          impact: 2 },
  { key: "dishwasher",          label: "Dishwasher",                   category: "Kitchen",          impact: 2 },
  { key: "microwave",           label: "Microwave",                    category: "Kitchen",          impact: 1 },
  { key: "refrigerator",        label: "Refrigerator",                 category: "Kitchen",          impact: 3 },
  { key: "cooking_basics",      label: "Cooking Basics (pots/pans)",   category: "Kitchen",          impact: 2 },
  // ── Laundry ───────────────────────────────────────────────────────────────
  { key: "washer",              label: "Washer",                       category: "Laundry",          impact: 3 },
  { key: "dryer",               label: "Dryer",                        category: "Laundry",          impact: 3 },
  { key: "iron_board",          label: "Iron & Board",                 category: "Laundry",          impact: 1 },
  // ── Bedroom & Bath ────────────────────────────────────────────────────────
  { key: "extra_bedding",       label: "Extra Pillows & Blankets",     category: "Bedroom & Bath",   impact: 2 },
  { key: "blackout_curtains",   label: "Blackout Curtains",            category: "Bedroom & Bath",   impact: 2 },
  { key: "hair_dryer",          label: "Hair Dryer",                   category: "Bedroom & Bath",   impact: 2 },
  { key: "shampoo_toiletries",  label: "Shampoo & Toiletries",         category: "Bedroom & Bath",   impact: 1 },
  { key: "hot_water",           label: "Hot Water",                    category: "Bedroom & Bath",   impact: 3 },
  // ── Entertainment ────────────────────────────────────────────────────────
  { key: "streaming_services",  label: "Streaming Services",           category: "Entertainment",    impact: 2 },
  { key: "game_console",        label: "Game Console",                 category: "Entertainment",    impact: 1 },
  { key: "board_games",         label: "Board Games & Puzzles",        category: "Entertainment",    impact: 1 },
  { key: "bluetooth_speaker",   label: "Bluetooth Speaker",            category: "Entertainment",    impact: 1 },
  // ── Climate ───────────────────────────────────────────────────────────────
  { key: "air_conditioning",    label: "Air Conditioning",             category: "Climate",          impact: 3 },
  { key: "heating",             label: "Central Heating",              category: "Climate",          impact: 3 },
  { key: "ceiling_fan",         label: "Ceiling Fan",                  category: "Climate",          impact: 1 },
  { key: "space_heater",        label: "Space Heater",                 category: "Climate",          impact: 1 },
  // ── Parking & Access ──────────────────────────────────────────────────────
  { key: "free_parking",        label: "Free Parking On-Site",         category: "Parking & Access", impact: 3 },
  { key: "garage_parking",      label: "Garage / Covered Parking",     category: "Parking & Access", impact: 2 },
  { key: "ev_charger",          label: "EV Charger",                   category: "Parking & Access", impact: 1 },
  { key: "keyless_entry",       label: "Keyless / Self Check-In",      category: "Parking & Access", impact: 3 },
  // ── Outdoor ───────────────────────────────────────────────────────────────
  { key: "private_patio",       label: "Private Patio or Deck",        category: "Outdoor",          impact: 2 },
  { key: "bbq_grill",           label: "BBQ Grill",                    category: "Outdoor",          impact: 2 },
  { key: "outdoor_furniture",   label: "Outdoor Furniture",            category: "Outdoor",          impact: 1 },
  { key: "fire_pit",            label: "Fire Pit",                     category: "Outdoor",          impact: 1 },
  { key: "hot_tub",             label: "Hot Tub",                      category: "Outdoor",          impact: 2 },
  // ── Safety ────────────────────────────────────────────────────────────────
  { key: "smoke_alarm",         label: "Smoke Alarm",                  category: "Safety",           impact: 3 },
  { key: "co_alarm",            label: "Carbon Monoxide Alarm",        category: "Safety",           impact: 3 },
  { key: "fire_extinguisher",   label: "Fire Extinguisher",            category: "Safety",           impact: 2 },
  { key: "first_aid_kit",       label: "First Aid Kit",                category: "Safety",           impact: 1 },
  // ── Guest Experience ──────────────────────────────────────────────────────
  { key: "welcome_basket",      label: "Welcome Basket",               category: "Guest Experience", impact: 1 },
  { key: "local_guidebook",     label: "Local Area Guidebook",         category: "Guest Experience", impact: 1 },
  { key: "pet_friendly",        label: "Pet Friendly",                 category: "Guest Experience", impact: 2 },
]

export const CATEGORIES = [
  "Connectivity", "Kitchen", "Laundry", "Bedroom & Bath",
  "Entertainment", "Climate", "Parking & Access", "Outdoor",
  "Safety", "Guest Experience",
] as const

export const MAX_SCORE = AMENITIES.reduce((s, a) => s + a.impact, 0) // 83

export function calcScore(state: Record<string, boolean>): { score: number; pct: number } {
  const score = AMENITIES.reduce((s, a) => s + (state[a.key] ? a.impact : 0), 0)
  return { score, pct: Math.round((score / MAX_SCORE) * 100) }
}
