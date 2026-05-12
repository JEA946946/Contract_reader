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
