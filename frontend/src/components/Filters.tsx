import { useEffect, useState } from "react";
import { getCities, getHotelTypes } from "../api/client";

interface FiltersProps {
  onFilterChange: (filters: {
    city?: string;
    hotel_type?: string;
    price_min?: number;
    price_max?: number;
    search?: string;
    max_room_types?: number;
  }) => void;
}

const filterStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderRadius: 6,
  border: "1px solid #ddd",
  fontSize: "0.65rem",
  height: 34,
  boxSizing: "border-box",
};

export default function Filters({ onFilterChange }: FiltersProps) {
  const [cities, setCities] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [hotelType, setHotelType] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [search, setSearch] = useState("");
  const [maxRoomTypes, setMaxRoomTypes] = useState("");

  useEffect(() => {
    getCities().then(setCities).catch(() => {});
    getHotelTypes().then(setTypes).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      onFilterChange({
        city: city || undefined,
        hotel_type: hotelType || undefined,
        price_min: priceMin ? Number(priceMin) : undefined,
        price_max: priceMax ? Number(priceMax) : undefined,
        search: search || undefined,
        max_room_types: maxRoomTypes ? Number(maxRoomTypes) : undefined,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [city, hotelType, priceMin, priceMax, search, maxRoomTypes, onFilterChange]);

  const hasFilters = city || hotelType || priceMin || priceMax || search || maxRoomTypes;

  const reset = () => {
    setCity("");
    setHotelType("");
    setPriceMin("");
    setPriceMax("");
    setSearch("");
    setMaxRoomTypes("");
  };

  return (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
      <input
        type="text"
        placeholder="Search hotels, cities..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...filterStyle, width: 180 }}
      />
      <select value={city} onChange={(e) => setCity(e.target.value)} style={{ ...filterStyle, width: 140 }}>
        <option value="">All Cities</option>
        {cities.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <select value={hotelType} onChange={(e) => setHotelType(e.target.value)} style={{ ...filterStyle, width: 140 }}>
        <option value="">All Types</option>
        {types.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
        <input
          type="number"
          placeholder="Min"
          value={priceMin}
          onChange={(e) => setPriceMin(e.target.value)}
          style={{ ...filterStyle, width: 80 }}
          min={0}
        />
        <span style={{ color: "#888", fontSize: "0.65rem" }}>–</span>
        <input
          type="number"
          placeholder="Max"
          value={priceMax}
          onChange={(e) => setPriceMax(e.target.value)}
          style={{ ...filterStyle, width: 80 }}
          min={0}
        />
      </div>
      <select value={maxRoomTypes} onChange={(e) => setMaxRoomTypes(e.target.value)} style={{ ...filterStyle, width: 140 }}>
        <option value="">All Room Types</option>
        <option value="1">Max 1 room type</option>
        <option value="2">Max 2 room types</option>
        <option value="3">Max 3 room types</option>
      </select>
      {hasFilters && (
        <button
          onClick={reset}
          style={{
            ...filterStyle,
            width: "auto",
            background: "none",
            color: "#e94560",
            border: "1px solid #e94560",
            cursor: "pointer",
            fontWeight: 600,
            padding: "0.5rem 0.75rem",
          }}
        >
          Reset
        </button>
      )}
    </div>
  );
}
