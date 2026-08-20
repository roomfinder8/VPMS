/**
 * A starting point for the vehicle brand autocomplete - common brands seen on
 * Thai roads. This is not a constraint: any text can still be typed, since
 * there is no fixed list to validate against (see the 0013 migration notes).
 * Brands actually typed in get folded in alongside these in page.tsx, so the
 * suggestions grow on their own from real data over time.
 */
export const SUGGESTED_VEHICLE_BRANDS = [
  "Toyota",
  "Honda",
  "Isuzu",
  "Mitsubishi",
  "Nissan",
  "Mazda",
  "Ford",
  "Mercedes-Benz",
  "BMW",
  "MG",
  "BYD",
  "Hyundai",
  "Kia",
  "Suzuki",
  "Volvo",
];
