import axios from "axios";
import type {
  PriceListResponse,
  Document,
  UploadResponse,
  ConfirmResponse,
  ParsedRow,
  ParsedMenuRow,
  ParsedTransportRow,
  Stats,
  CreateHotelResponse,
  HotelDetail,
  Hotel,
  EmailPollingStatus,
  MenuPriceListResponse,
  TransportPriceListResponse,
  Folder,
  ProcessedEmail,
  ProcessedEmailListResponse,
  EmailFolderRule,
  EmailLabel,
  ManagedCity,
  ManagedCategory,
  RestaurantDetail,
  CreateRestaurantResponse,
  TransportDetail,
  CreateTransportResponse,
} from "../types";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

export async function uploadDocument(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<UploadResponse>("/documents/upload", formData, {
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        // Upload phase is 0-50%, server processing is 50-100%
        const uploadPercent = Math.round((e.loaded / e.total) * 50);
        onProgress(uploadPercent);
      }
    },
  });
  return data;
}

export async function confirmDocument(
  documentId: number,
  rows: ParsedRow[]
): Promise<ConfirmResponse> {
  const { data } = await api.post<ConfirmResponse>(
    `/documents/${documentId}/confirm`,
    { rows }
  );
  return data;
}

export async function getPendingDocuments(): Promise<Document[]> {
  const { data } = await api.get<Document[]>("/documents/pending");
  return data;
}

export async function getParsedRows(documentId: number): Promise<UploadResponse> {
  const { data } = await api.get<UploadResponse>(`/documents/${documentId}/parsed-rows`);
  return data;
}

export async function aiReparseDocument(documentId: number): Promise<UploadResponse> {
  const { data } = await api.post<UploadResponse>(`/documents/${documentId}/ai-reparse`);
  return data;
}

export async function parseText(text: string): Promise<UploadResponse> {
  const { data } = await api.post<UploadResponse>("/documents/parse-text", { text });
  return data;
}

export async function getDocuments(category?: string): Promise<Document[]> {
  const params: Record<string, string> = {};
  if (category) params.category = category;
  const { data } = await api.get<Document[]>("/documents", { params });
  return data;
}

export async function deleteDocument(id: number): Promise<void> {
  await api.delete(`/documents/${id}`);
}

export async function batchReparseDocuments(
  filter: "failed" | "zero_rows"
): Promise<{ queued: number; skipped: number; message: string }> {
  const { data } = await api.post("/documents/batch-reparse", { filter });
  return data;
}

export async function updateDocumentEntity(
  documentId: number,
  entityName: string,
  city: string
): Promise<Document> {
  const { data } = await api.patch<Document>(`/documents/${documentId}/entity`, {
    entity_name: entityName,
    city,
  });
  return data;
}

export async function getPrices(params: {
  city?: string;
  hotel_name?: string;
  season_code?: string;
  fit_git?: string;
  hotel_type?: string;
  price_min?: number;
  price_max?: number;
  search?: string;
  max_room_types?: number;
  page?: number;
  page_size?: number;
}): Promise<PriceListResponse> {
  const { data } = await api.get<PriceListResponse>("/prices", { params });
  return data;
}

export async function getCities(): Promise<string[]> {
  const { data } = await api.get<string[]>("/prices/cities");
  return data;
}

export async function getHotelTypes(): Promise<string[]> {
  const { data } = await api.get<string[]>("/prices/types");
  return data;
}

export async function getSeasons(): Promise<string[]> {
  const { data } = await api.get<string[]>("/prices/seasons");
  return data;
}

export async function getStats(): Promise<Stats> {
  const { data } = await api.get<Stats>("/stats");
  return data;
}

export async function listHotels(): Promise<Hotel[]> {
  const { data } = await api.get<Hotel[]>("/hotels");
  return data;
}

export async function getHotel(hotelId: number): Promise<HotelDetail> {
  const { data } = await api.get<HotelDetail>(`/hotels/${hotelId}`);
  return data;
}

type HotelPricePayload = {
  name: string;
  city: string;
  stars?: number | null;
  type?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
  postal_code?: string | null;
  state?: string | null;
  prices: {
    room_desc?: string | null;
    meal_plan?: string | null;
    double_price?: number | null;
    single_price?: number | null;
    twin_price?: number | null;
    fit_git?: string | null;
    season_code?: string | null;
    date_ranges: { date_from: string | null; date_to: string | null }[];
    note?: string | null;
  }[];
};

export async function updateHotelWithPrices(
  hotelId: number,
  data: HotelPricePayload
): Promise<CreateHotelResponse> {
  const { data: resp } = await api.put<CreateHotelResponse>(`/hotels/${hotelId}`, data);
  return resp;
}

export async function deleteHotel(hotelId: number): Promise<void> {
  await api.delete(`/hotels/${hotelId}`);
}

export async function createHotelWithPrices(
  data: HotelPricePayload
): Promise<CreateHotelResponse> {
  const { data: resp } = await api.post<CreateHotelResponse>("/hotels", data);
  return resp;
}

export async function getEmailPollingStatus(): Promise<EmailPollingStatus> {
  const { data } = await api.get<EmailPollingStatus>("/email-polling/status");
  return data;
}

export async function triggerPollNow(): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>("/email-polling/poll-now");
  return data;
}

export function getDocumentFileUrl(documentId: number): string {
  return `${api.defaults.baseURL}/documents/${documentId}/file`;
}

export interface DocumentAttachment {
  index: number;
  filename: string;
  content_type: string;
}

export async function getDocumentAttachments(documentId: number): Promise<DocumentAttachment[]> {
  const { data } = await api.get(`/documents/${documentId}/attachments`);
  return data;
}

export function getDocumentAttachmentUrl(documentId: number, attIndex: number): string {
  return `${api.defaults.baseURL}/documents/${documentId}/attachments/${attIndex}`;
}

export function getExportUrl(
  format: "csv" | "excel",
  filters: { city?: string; hotel_name?: string; season_code?: string }
): string {
  const params = new URLSearchParams();
  if (filters.city) params.set("city", filters.city);
  if (filters.hotel_name) params.set("hotel_name", filters.hotel_name);
  if (filters.season_code) params.set("season_code", filters.season_code);
  const query = params.toString();
  return `${api.defaults.baseURL}/export/${format}${query ? `?${query}` : ""}`;
}

// --- Restaurant API ---

export async function confirmRestaurantDocument(
  documentId: number,
  rows: ParsedMenuRow[]
): Promise<ConfirmResponse> {
  const { data } = await api.post<ConfirmResponse>(
    `/documents/${documentId}/confirm-restaurant`,
    { rows }
  );
  return data;
}

export async function getMenuPrices(params: {
  city?: string;
  restaurant_name?: string;
  season_code?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<MenuPriceListResponse> {
  const { data } = await api.get<MenuPriceListResponse>("/restaurants", { params });
  return data;
}

export async function getRestaurantCities(): Promise<string[]> {
  const { data } = await api.get<string[]>("/restaurants/cities");
  return data;
}

export async function getRestaurantSeasons(): Promise<string[]> {
  const { data } = await api.get<string[]>("/restaurants/seasons");
  return data;
}

export async function deleteRestaurant(restaurantId: number): Promise<void> {
  await api.delete(`/restaurants/${restaurantId}`);
}

export async function getRestaurantDetail(id: number): Promise<RestaurantDetail> {
  const { data } = await api.get<RestaurantDetail>(`/restaurants/${id}`);
  return data;
}

export async function createRestaurant(payload: {
  name: string;
  city: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  menu_prices: {
    menu_name?: string | null;
    description?: string | null;
    lunch_price?: number | null;
    dinner_price?: number | null;
    lunch_child_price?: number | null;
    dinner_child_price?: number | null;
    course_1?: string | null;
    course_2?: string | null;
    course_3?: string | null;
    course_4?: string | null;
    course_5?: string | null;
    min_pax?: number | null;
    drink_included?: string | null;
    season_code?: string | null;
    date_ranges?: { date_from: string | null; date_to: string | null }[];
    note?: string | null;
  }[];
}): Promise<CreateRestaurantResponse> {
  const { data } = await api.post<CreateRestaurantResponse>("/restaurants", payload);
  return data;
}

export async function updateRestaurant(id: number, payload: {
  name: string;
  city: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  menu_prices: {
    menu_name?: string | null;
    description?: string | null;
    lunch_price?: number | null;
    dinner_price?: number | null;
    lunch_child_price?: number | null;
    dinner_child_price?: number | null;
    course_1?: string | null;
    course_2?: string | null;
    course_3?: string | null;
    course_4?: string | null;
    course_5?: string | null;
    min_pax?: number | null;
    drink_included?: string | null;
    season_code?: string | null;
    date_ranges?: { date_from: string | null; date_to: string | null }[];
    note?: string | null;
  }[];
}): Promise<CreateRestaurantResponse> {
  const { data } = await api.put<CreateRestaurantResponse>(`/restaurants/${id}`, payload);
  return data;
}

// --- Transportation API ---

export async function confirmTransportDocument(
  documentId: number,
  rows: ParsedTransportRow[]
): Promise<ConfirmResponse> {
  const { data } = await api.post<ConfirmResponse>(
    `/documents/${documentId}/confirm-transportation`,
    { rows }
  );
  return data;
}

export async function getTransportPrices(params: {
  city?: string;
  company?: string;
  service_type?: string;
  bus_size?: number;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<TransportPriceListResponse> {
  const { data } = await api.get<TransportPriceListResponse>("/transportation", { params });
  return data;
}

export async function getTransportCities(): Promise<string[]> {
  const { data } = await api.get<string[]>("/transportation/cities");
  return data;
}

export async function getServiceTypes(): Promise<string[]> {
  const { data } = await api.get<string[]>("/transportation/service-types");
  return data;
}

export async function getTransportCompanies(): Promise<string[]> {
  const { data } = await api.get<string[]>("/transportation/companies");
  return data;
}

export async function deleteTransportCompany(id: number): Promise<void> {
  await api.delete(`/transportation/${id}`);
}

export async function getTransportDetail(id: number): Promise<TransportDetail> {
  const { data } = await api.get<TransportDetail>(`/transportation/${id}`);
  return data;
}

export async function createTransportCompany(payload: {
  name: string;
  code: string;
  city: string;
  phone?: string | null;
  email?: string | null;
  transport_prices: {
    code?: string | null;
    price?: number | null;
    product?: string | null;
    bus_size?: number | null;
    service_type?: string | null;
    days?: number | null;
    route_description?: string | null;
    note?: string | null;
    city?: string | null;
  }[];
}): Promise<CreateTransportResponse> {
  const { data } = await api.post<CreateTransportResponse>("/transportation", payload);
  return data;
}

export async function updateTransportCompany(id: number, payload: {
  name: string;
  code: string;
  city: string;
  phone?: string | null;
  email?: string | null;
  transport_prices: {
    code?: string | null;
    price?: number | null;
    product?: string | null;
    bus_size?: number | null;
    service_type?: string | null;
    days?: number | null;
    route_description?: string | null;
    note?: string | null;
    city?: string | null;
  }[];
}): Promise<CreateTransportResponse> {
  const { data } = await api.put<CreateTransportResponse>(`/transportation/${id}`, payload);
  return data;
}

// --- Folder API ---

export async function getFolderTree(): Promise<Folder[]> {
  const { data } = await api.get<Folder[]>("/folders/tree");
  return data;
}

export async function createFolder(name: string, parentId?: number | null): Promise<Folder> {
  const { data } = await api.post<Folder>("/folders", { name, parent_id: parentId ?? null });
  return data;
}

export async function renameFolder(folderId: number, name: string): Promise<Folder> {
  const { data } = await api.patch<Folder>(`/folders/${folderId}/rename`, { name });
  return data;
}

export async function moveFolder(folderId: number, parentId: number | null): Promise<Folder> {
  const { data } = await api.patch<Folder>(`/folders/${folderId}/move`, { parent_id: parentId });
  return data;
}

export async function deleteFolder(folderId: number): Promise<void> {
  await api.delete(`/folders/${folderId}`);
}

export async function getFolderDocuments(folderId: number): Promise<Document[]> {
  const { data } = await api.get<Document[]>(`/folders/${folderId}/documents`);
  return data;
}

export async function getUnfiledDocuments(): Promise<Document[]> {
  const { data } = await api.get<Document[]>("/folders/unfiled");
  return data;
}

export async function moveDocumentToFolder(documentId: number, folderId: number | null): Promise<Document> {
  const { data } = await api.patch<Document>(`/folders/documents/${documentId}/move-to-folder`, { folder_id: folderId });
  return data;
}

export async function batchMoveDocuments(documentIds: number[], folderId: number | null): Promise<void> {
  await api.patch("/folders/documents/batch-move", { document_ids: documentIds, folder_id: folderId });
}

// --- Email Inbox API ---

export async function getEmails(params: {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  label?: string;
  folder_id?: number;
  unfiled?: boolean;
}): Promise<ProcessedEmailListResponse> {
  const { data } = await api.get<ProcessedEmailListResponse>("/email-polling/emails", { params });
  return data;
}

export async function getEmailDetail(id: number): Promise<ProcessedEmail> {
  const { data } = await api.get<ProcessedEmail>(`/email-polling/emails/${id}`);
  return data;
}

export async function assignEmailFolder(emailId: number, folderId: number | null): Promise<void> {
  await api.patch(`/email-polling/emails/${emailId}/assign-folder`, { folder_id: folderId });
}

export async function setEmailLabel(emailId: number, label: EmailLabel | null): Promise<void> {
  await api.patch(`/email-polling/emails/${emailId}/label`, { label });
}

export async function requeueEmail(emailId: number): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(`/email-polling/emails/${emailId}/requeue`);
  return data;
}

export async function getEmailByDocument(documentId: number): Promise<{ email_id: number }> {
  const { data } = await api.get<{ email_id: number }>(`/email-polling/emails/by-document/${documentId}`);
  return data;
}

// --- Email Folder Rules API ---

export async function getEmailRules(): Promise<EmailFolderRule[]> {
  const { data } = await api.get<EmailFolderRule[]>("/email-rules");
  return data;
}

export async function createEmailRule(rule: {
  keyword: string;
  folder_id: number;
  is_case_sensitive?: boolean;
  priority?: number;
}): Promise<EmailFolderRule> {
  const { data } = await api.post<EmailFolderRule>("/email-rules", rule);
  return data;
}

export async function updateEmailRule(
  id: number,
  updates: Partial<{ keyword: string; folder_id: number; is_case_sensitive: boolean; priority: number }>
): Promise<EmailFolderRule> {
  const { data } = await api.put<EmailFolderRule>(`/email-rules/${id}`, updates);
  return data;
}

export async function deleteEmailRule(id: number): Promise<void> {
  await api.delete(`/email-rules/${id}`);
}

// --- Managed Cities API ---

export async function getManagedCities(): Promise<ManagedCity[]> {
  const { data } = await api.get<ManagedCity[]>("/managed/cities");
  return data;
}

export async function createManagedCity(name: string): Promise<ManagedCity> {
  const { data } = await api.post<ManagedCity>("/managed/cities", { name });
  return data;
}

export async function updateManagedCity(id: number, name: string): Promise<ManagedCity> {
  const { data } = await api.put<ManagedCity>(`/managed/cities/${id}`, { name });
  return data;
}

export async function deleteManagedCity(id: number): Promise<void> {
  await api.delete(`/managed/cities/${id}`);
}

// --- Push to CMR API ---

export async function pushHotelToCmr(hotelId: number): Promise<{ success: boolean; message: string; action: string; cmr_supplier_id: string; rates_count: number }> {
  const { data } = await api.post(`/suppliers/hotels/${hotelId}/push-to-cmr`);
  return data;
}

export async function pushRestaurantToCmr(restaurantId: number): Promise<{ success: boolean; message: string; action: string; cmr_supplier_id: string; menus_count: number }> {
  const { data } = await api.post(`/suppliers/restaurants/${restaurantId}/push-to-cmr`);
  return data;
}

export async function pushTransportToCmr(companyId: number): Promise<{ success: boolean; message: string; action: string; cmr_supplier_id: string; routes_count: number }> {
  const { data } = await api.post(`/suppliers/transport-companies/${companyId}/push-to-cmr`);
  return data;
}

// --- Managed Categories API ---

export async function getManagedCategories(): Promise<ManagedCategory[]> {
  const { data } = await api.get<ManagedCategory[]>("/managed/categories");
  return data;
}

export async function createManagedCategory(cat: { slug: string; label: string }): Promise<ManagedCategory> {
  const { data } = await api.post<ManagedCategory>("/managed/categories", cat);
  return data;
}

export async function updateManagedCategory(
  id: number,
  updates: Partial<{ slug: string; label: string }>
): Promise<ManagedCategory> {
  const { data } = await api.put<ManagedCategory>(`/managed/categories/${id}`, updates);
  return data;
}

export async function deleteManagedCategory(id: number): Promise<void> {
  await api.delete(`/managed/categories/${id}`);
}

// --- Google Places API ---

export interface PlacePrediction {
  place_id: string;
  description: string;
}

export interface PlaceDetails {
  name: string;
  address: string;
  phone: string;
  website: string;
  city: string;
  country: string;
  postal_code: string;
  state: string;
}

export async function searchPlaces(query: string, region: string = "ma"): Promise<PlacePrediction[]> {
  const { data } = await api.get<{ predictions: PlacePrediction[] }>("/places/autocomplete", {
    params: { q: query, region },
  });
  return data.predictions;
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const { data } = await api.get<PlaceDetails>("/places/details", {
    params: { place_id: placeId },
  });
  return data;
}
