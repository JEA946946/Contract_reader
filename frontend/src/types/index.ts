export interface SeasonDate {
  id: number;
  date_from: string;
  date_to: string;
}

export interface Hotel {
  id: number;
  name: string;
  city: string;
  stars: number | null;
  type: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  postal_code: string | null;
  state: string | null;
  source_document_id: number | null;
  cmr_supplier_id: string | null;
}

export interface Price {
  id: number;
  document_id: number | null;
  hotel: Hotel;
  room_desc: string | null;
  meal_plan: string | null;
  double_price: number | null;
  single_price: number | null;
  twin_price: number | null;
  triple_price: number | null;
  quadruple_price: number | null;
  fit_git: string | null;
  season_code: string | null;
  baby_discount: string | null;
  child_discount: string | null;
  min_stay: number | null;
  note: string | null;
  season_dates: SeasonDate[];
}

export interface PriceListResponse {
  items: Price[];
  total: number;
  page: number;
  page_size: number;
}

export interface Document {
  id: number;
  filename: string;
  file_type: string;
  upload_date: string;
  status: string;
  row_count: number | null;
  notes: string | null;
  hotel_name: string | null;
  document_category: string;
  folder_id: number | null;
}

export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  folder_type: string;
  created_at: string;
  document_count: number;
  children: Folder[];
}

export interface ParsedDateRange {
  date_from: string | null;
  date_to: string | null;
}

export interface ParsedRow {
  accommodation: string;
  city: string;
  room_desc: string | null;
  double_price: number | null;
  single_price: number | null;
  twin_price: number | null;
  triple_price: number | null;
  quadruple_price: number | null;
  stars: number | null;
  hotel_type: string | null;
  meal_plan: string | null;
  fit_git: string | null;
  season_code: string | null;
  baby_discount: string | null;
  child_discount: string | null;
  date_ranges: ParsedDateRange[];
  min_stay: number | null;
  note: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface ParsedMenuRow {
  restaurant_name: string;
  city: string;
  menu_name: string | null;
  description: string | null;
  lunch_price: number | null;
  dinner_price: number | null;
  lunch_child_price: number | null;
  dinner_child_price: number | null;
  course_1: string | null;
  course_2: string | null;
  course_3: string | null;
  course_4: string | null;
  course_5: string | null;
  min_pax: number | null;
  drink_included: string | null;
  season_code: string | null;
  date_ranges: ParsedDateRange[];
  note: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export type ServiceType = "transfer" | "roundtrip" | "soiree" | "excursion" | "mise_a_dispo";

export interface ParsedTransportRow {
  code: string;
  price: number | null;
  company_name: string;
  company_code: string;
  product: string;
  bus_size: number | null;
  service_type: string;
  days: number | null;
  route_description: string;
  note: string;
  city: string;
}

export interface UploadResponse {
  id: number;
  filename: string;
  status: string;
  row_count: number | null;
  message: string;
  rows: ParsedRow[];
  menu_rows: ParsedMenuRow[];
  transport_rows: ParsedTransportRow[];
  document_category: string;
}

export interface ConfirmResponse {
  id: number;
  filename: string;
  status: string;
  row_count: number;
  message: string;
}

export interface Stats {
  total_documents: number;
  total_hotels: number;
  total_prices: number;
  total_restaurants: number;
  total_menu_prices: number;
  total_transport_companies: number;
  total_transport_prices: number;
  cities: string[];
  recent_uploads: Document[];
}

export interface RestaurantType {
  id: number;
  name: string;
  city: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  source_document_id: number | null;
  cmr_supplier_id: string | null;
}

export interface MenuSeasonDate {
  id: number;
  date_from: string;
  date_to: string;
}

export interface MenuPrice {
  id: number;
  document_id: number | null;
  restaurant: RestaurantType;
  menu_name: string | null;
  description: string | null;
  lunch_price: number | null;
  dinner_price: number | null;
  lunch_child_price: number | null;
  dinner_child_price: number | null;
  course_1: string | null;
  course_2: string | null;
  course_3: string | null;
  course_4: string | null;
  course_5: string | null;
  min_pax: number | null;
  drink_included: string | null;
  season_code: string | null;
  note: string | null;
  season_dates: MenuSeasonDate[];
}

export interface MenuPriceListResponse {
  items: MenuPrice[];
  total: number;
  page: number;
  page_size: number;
}

export type PricingMode = "per_person" | "half_double" | "per_room";

export interface PriceRow {
  room_desc: string;
  meal_plan: string;
  pricing_mode: PricingMode;
  base_price: number | null;
  tax: number | null;
  sgl_supplement: number | null;
  double_price: number | null;
  single_price: number | null;
  twin_price: number | null;
  triple_price: number | null;
  quadruple_price: number | null;
  fit_git: string;
  note: string;
}

export interface SeasonBlock {
  season_code: string;
  date_ranges: ParsedDateRange[];
  prices: PriceRow[];
}

export interface CreateHotelResponse {
  hotel_id: number;
  hotel_name: string;
  price_count: number;
  message: string;
}

export interface PriceWithoutHotel {
  id: number;
  document_id: number | null;
  room_desc: string | null;
  meal_plan: string | null;
  double_price: number | null;
  single_price: number | null;
  twin_price: number | null;
  triple_price: number | null;
  quadruple_price: number | null;
  fit_git: string | null;
  season_code: string | null;
  baby_discount: string | null;
  child_discount: string | null;
  min_stay: number | null;
  note: string | null;
  season_dates: SeasonDate[];
}

export interface HotelDetail {
  id: number;
  name: string;
  city: string;
  stars: number | null;
  type: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  postal_code: string | null;
  state: string | null;
  cmr_supplier_id: string | null;
  prices: PriceWithoutHotel[];
}

export interface MenuPriceWithoutRestaurant {
  id: number;
  document_id: number | null;
  menu_name: string | null;
  description: string | null;
  lunch_price: number | null;
  dinner_price: number | null;
  lunch_child_price: number | null;
  dinner_child_price: number | null;
  course_1: string | null;
  course_2: string | null;
  course_3: string | null;
  course_4: string | null;
  course_5: string | null;
  min_pax: number | null;
  drink_included: string | null;
  season_code: string | null;
  note: string | null;
  season_dates: MenuSeasonDate[];
}

export interface RestaurantDetail {
  id: number;
  name: string;
  city: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  cmr_supplier_id: string | null;
  menu_prices: MenuPriceWithoutRestaurant[];
}

export interface CreateRestaurantResponse {
  restaurant_id: number;
  restaurant_name: string;
  price_count: number;
  message: string;
}

export interface TransportPriceWithoutCompany {
  id: number;
  document_id: number | null;
  code: string | null;
  price: number | null;
  product: string | null;
  bus_size: number | null;
  service_type: string | null;
  days: number | null;
  route_description: string | null;
  note: string | null;
  city: string | null;
}

export interface TransportDetail {
  id: number;
  name: string;
  code: string;
  city: string;
  phone: string | null;
  email: string | null;
  cmr_supplier_id: string | null;
  transport_prices: TransportPriceWithoutCompany[];
}

export interface CreateTransportResponse {
  company_id: number;
  company_name: string;
  price_count: number;
  message: string;
}

export interface EmailPollingStatus {
  enabled: boolean;
  email: string;
  poll_interval_minutes: number;
  total_processed: number;
  last_processed_at: string | null;
}

export interface TransportCompany {
  id: number;
  name: string;
  code: string;
  city: string;
  phone: string | null;
  email: string | null;
  source_document_id: number | null;
  cmr_supplier_id: string | null;
}

export interface TransportPrice {
  id: number;
  document_id: number | null;
  company: TransportCompany;
  code: string | null;
  price: number | null;
  product: string | null;
  bus_size: number | null;
  service_type: string | null;
  days: number | null;
  route_description: string | null;
  note: string | null;
  city: string | null;
}

export interface TransportPriceListResponse {
  items: TransportPrice[];
  total: number;
  page: number;
  page_size: number;
}

export type EmailLabel = "accommodation" | "restaurant" | "transportation" | "entrees" | "packages";

export const EMAIL_LABELS: EmailLabel[] = ["accommodation", "restaurant", "transportation", "entrees", "packages"];

export interface ProcessedEmail {
  id: number;
  message_id: string;
  subject: string | null;
  sender: string | null;
  received_date: string | null;
  document_id: number | null;
  processed_at: string;
  status: string;
  notes: string | null;
  body_text: string | null;
  body_html: string | null;
  attachment_names: string | null;
  folder_id: number | null;
  folder_name: string | null;
  label: EmailLabel | null;
  document_row_count: number | null;
  document_status: string | null;
}

export interface ProcessedEmailListResponse {
  items: ProcessedEmail[];
  total: number;
  page: number;
  page_size: number;
}

export interface EmailFolderRule {
  id: number;
  keyword: string;
  folder_id: number;
  is_case_sensitive: boolean;
  priority: number;
  created_at: string;
  folder_name: string | null;
}

export interface ManagedCity {
  id: number;
  name: string;
  created_at: string;
}

export interface ManagedCategory {
  id: number;
  slug: string;
  label: string;
  created_at: string;
}
