import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createHotelWithPrices,
  updateHotelWithPrices,
  getHotel,
  listHotels,
  pushHotelToCmr,
  searchPlaces,
  getPlaceDetails,
} from "../api/client";
import type { PlacePrediction } from "../api/client";
import type { Hotel } from "../types";
import type {
  PriceRow,
  SeasonBlock,
  PricingMode,
  ParsedDateRange,
} from "../types";

/* ── helpers ────────────────────────────────────────── */

function emptyPriceRow(): PriceRow {
  return {
    room_desc: "",
    meal_plan: "",
    pricing_mode: "per_room",
    base_price: null,
    tax: null,
    sgl_supplement: null,
    double_price: null,
    single_price: null,
    twin_price: null,
    triple_price: null,
    quadruple_price: null,
    fit_git: "",
    note: "",
  };
}

function emptySeason(): SeasonBlock {
  return {
    season_code: "",
    date_ranges: [{ date_from: null, date_to: null }],
    prices: [emptyPriceRow()],
  };
}

/** Calculate BASE prices from row inputs (no tax, no HB — just the raw calculation). */
function calcPrices(row: PriceRow): { dbl: number | null; sgl: number | null; twn: number | null; trp: number | null; quad: number | null } {
  const mode = row.pricing_mode;
  if (mode === "per_person") {
    if (row.base_price == null) return { dbl: null, sgl: null, twn: null, trp: null, quad: null };
    const pax = row.base_price;
    const supp = row.sgl_supplement ?? 0;
    return { dbl: Math.round(2 * pax), sgl: Math.round(pax + supp), twn: Math.round(2 * pax), trp: row.triple_price, quad: row.quadruple_price };
  }
  if (mode === "half_double") {
    if (row.base_price == null) return { dbl: null, sgl: null, twn: null, trp: null, quad: null };
    const half = row.base_price;
    const supp = row.sgl_supplement ?? 0;
    return { dbl: Math.round(2 * half), sgl: Math.round(half + supp), twn: Math.round(2 * half), trp: row.triple_price, quad: row.quadruple_price };
  }
  return { dbl: row.double_price, sgl: row.single_price, twn: row.twin_price, trp: row.triple_price, quad: row.quadruple_price };
}

type PriceSet = { dbl: number | null; sgl: number | null; twn: number | null; trp: number | null; quad: number | null };

/** Flatten seasons → API price rows (base prices only, no tax/HB). */
function expandSeasons(seasons: SeasonBlock[]) {
  const out: {
    room_desc: string | null;
    meal_plan: string | null;
    double_price: number | null;
    single_price: number | null;
    twin_price: number | null;
    triple_price: number | null;
    quadruple_price: number | null;
    fit_git: string | null;
    season_code: string | null;
    date_ranges: { date_from: string | null; date_to: string | null }[];
    note: string | null;
  }[] = [];

  for (const season of seasons) {
    const dates = season.date_ranges.filter((dr) => dr.date_from && dr.date_to);
    for (const row of season.prices) {
      const c = calcPrices(row);
      out.push({
        room_desc: row.room_desc || null,
        meal_plan: row.meal_plan || null,
        double_price: c.dbl ?? null,
        single_price: c.sgl ?? null,
        twin_price: c.twn ?? null,
        triple_price: c.trp ?? null,
        quadruple_price: c.quad ?? null,
        fit_git: row.fit_git || null,
        season_code: season.season_code || null,
        date_ranges: dates,
        note: row.note || null,
      });
    }
  }
  return out;
}

/* ── styles ─────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: "1.25rem",
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
};

const HOTEL_TYPES = [
  "Hotel",
  "Riad",
  "Kasbah",
  "Resort",
  "Desert Camp",
  "Lodge",
  "Villa",
  "Boutique Hotel",
  "Guesthouse",
  "Auberge",
  "Dar",
  "Apartment",
];

const inp: React.CSSProperties = {
  padding: "0.4rem 0.5rem",
  border: "1px solid #ddd",
  borderRadius: 4,
  fontSize: "0.85rem",
  width: "100%",
  boxSizing: "border-box",
};

const sel: React.CSSProperties = { ...inp, background: "#fff" };

const lbl: React.CSSProperties = {
  display: "block",
  marginBottom: "0.15rem",
  fontWeight: 600,
  fontSize: "0.72rem",
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.3px",
};

const num: React.CSSProperties = { ...inp, width: 80, textAlign: "right" as const };

const dashedBtn: React.CSSProperties = {
  background: "none",
  border: "1px dashed #aaa",
  padding: "0.25rem 0.7rem",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: "0.78rem",
  color: "#666",
};

const xBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#b91c1c",
  cursor: "pointer",
  fontSize: "1rem",
  padding: "0 0.25rem",
  lineHeight: 1,
};

/* ── note cell ─────────────────────────────────────── */

function NoteCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, value]);

  const hasNote = value && value.trim().length > 0;

  return (
    <div style={{ position: "relative" }}>
      <div
        className="note-trigger"
        onClick={() => setOpen(true)}
        style={{
          cursor: "pointer",
          padding: "0.4rem 0.5rem",
          fontSize: "0.85rem",
          color: hasNote ? "#1a1a2e" : "#bbb",
          border: "1px solid #ddd",
          borderRadius: 4,
          background: "#fff",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {hasNote ? value.slice(0, 12) + (value.length > 12 ? "..." : "") : "+note"}
        {hasNote && (
          <div className="note-tooltip">
            {value}
          </div>
        )}
      </div>
      {open && (
        <div
          ref={ref}
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            zIndex: 100,
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: "0.5rem",
            width: 280,
          }}
        >
          <textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #ddd",
              borderRadius: 4,
              fontSize: "0.8rem",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: "3px 10px",
                fontSize: "0.75rem",
                border: "1px solid #ccc",
                borderRadius: 4,
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
              style={{
                padding: "3px 10px",
                fontSize: "0.75rem",
                border: "none",
                borderRadius: 4,
                background: "#1a1a2e",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── component ──────────────────────────────────────── */

export default function AddHotel() {
  const navigate = useNavigate();
  const { hotelId } = useParams<{ hotelId: string }>();
  const isEdit = !!hotelId;

  const [activeTab, setActiveTab] = useState<"info" | "prices">("info");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [cmrSupplierId, setCmrSupplierId] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushSnackbar, setPushSnackbar] = useState<{ msg: string; ok: boolean } | null>(null);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [stars, setStars] = useState<number | null>(null);
  const [type, setType] = useState("");
  const [customType, setCustomType] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [hotelState, setHotelState] = useState("");

  const [seasons, setSeasons] = useState<SeasonBlock[]>([]);

  // Setup definitions
  const [setupSeasons, setSetupSeasons] = useState<string[]>([""]);
  const [setupRoomTypes, setSetupRoomTypes] = useState<string[]>([""]);
  const [setupMealPlans, setSetupMealPlans] = useState<string[]>(["BB", "HB"]);
  const [setupFitGit, setSetupFitGit] = useState<string[]>([]);
  const [hotelTax, setHotelTax] = useState<number | null>(null);
  const [hbSupplement, setHbSupplement] = useState<number | null>(null);
  const [roomAddOns, setRoomAddOns] = useState<Record<string, number>>({});

  const [matchedHotel, setMatchedHotel] = useState<Hotel | null>(null);
  const [allHotels, setAllHotels] = useState<Hotel[]>([]);
  const [dismissedMatch, setDismissedMatch] = useState<number | null>(null);

  // Google Places autocomplete
  const [placePredictions, setPlacePredictions] = useState<PlacePrediction[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [showPlaces, setShowPlaces] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const placesRef = useRef<HTMLDivElement>(null);

  const MEAL_OPTIONS = ["RO", "BB", "HB", "FB", "AI"];
  const FIT_GIT_OPTIONS = ["FIT", "GIT", "All Year"];

  /* ── load all hotels for duplicate detection ── */
  useEffect(() => {
    if (isEdit) return;
    listHotels().then(setAllHotels).catch(() => {});
  }, [isEdit]);

  /* ── check for duplicate hotel name ── */
  useEffect(() => {
    if (isEdit || !name.trim() || allHotels.length === 0) {
      setMatchedHotel(null);
      return;
    }
    const timer = setTimeout(() => {
      const q = name.trim().toLowerCase();
      const match = allHotels.find(
        (h) => h.name.toLowerCase() === q || h.name.toLowerCase().includes(q) || q.includes(h.name.toLowerCase())
      );
      if (match && match.id !== dismissedMatch) {
        setMatchedHotel(match);
      } else {
        setMatchedHotel(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [name, allHotels, isEdit, dismissedMatch]);

  /* ── Google Places autocomplete search ── */
  useEffect(() => {
    if (name.trim().length < 2) {
      setPlacePredictions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setPlacesLoading(true);
      try {
        const results = await searchPlaces(name.trim(), "ma");
        setPlacePredictions(results);
        setShowPlaces(results.length > 0);
      } catch {
        setPlacePredictions([]);
      } finally {
        setPlacesLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [name]);

  /* ── close places dropdown on outside click ── */
  useEffect(() => {
    if (!showPlaces) return;
    const handleClick = (e: MouseEvent) => {
      if (placesRef.current && !placesRef.current.contains(e.target as Node)) {
        setShowPlaces(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showPlaces]);

  /* ── select a place from Google ── */
  async function handleSelectPlace(prediction: PlacePrediction) {
    setShowPlaces(false);
    setPlacePredictions([]);
    setLoadingDetails(true);
    try {
      const details = await getPlaceDetails(prediction.place_id);
      setName(details.name || prediction.description);
      if (details.city) setCity(details.city);
      if (details.address) setAddress(details.address);
      if (details.phone) setPhone(details.phone);
      if (details.country) setCountry(details.country);
      if (details.postal_code) setPostalCode(details.postal_code);
      if (details.state) setHotelState(details.state);
    } catch {
      // Fall back to just using the description as name
      setName(prediction.description);
    } finally {
      setLoadingDetails(false);
    }
  }

  /* ── load existing hotel ── */
  useEffect(() => {
    if (!hotelId) return;
    setLoading(true);
    getHotel(Number(hotelId))
      .then((h) => {
        setName(h.name);
        setCity(h.city);
        setStars(h.stars);
        setType(h.type ?? "");
        setAddress(h.address ?? "");
        setPhone(h.phone ?? "");
        setEmail(h.email ?? "");
        setCountry(h.country ?? "");
        setPostalCode(h.postal_code ?? "");
        setHotelState(h.state ?? "");
        setCmrSupplierId(h.cmr_supplier_id ?? null);

        // Group flat prices into season blocks
        const fitGitOrder = ["FIT", "GIT", "All Year"];
        const seasonMap = new Map<string, SeasonBlock>();

        for (const p of h.prices) {
          const key = p.season_code ?? "";
          if (!seasonMap.has(key)) {
            seasonMap.set(key, {
              season_code: key,
              date_ranges:
                p.season_dates.length > 0
                  ? p.season_dates.map((sd) => ({ date_from: sd.date_from, date_to: sd.date_to }))
                  : [{ date_from: null, date_to: null }],
              prices: [],
            });
          }
          seasonMap.get(key)!.prices.push({
            room_desc: p.room_desc ?? "",
            meal_plan: p.meal_plan ?? "",
            pricing_mode: "per_room",
            base_price: null,
            tax: null,
            sgl_supplement: null,
            double_price: p.double_price != null ? Number(p.double_price) : null,
            single_price: p.single_price != null ? Number(p.single_price) : null,
            twin_price: p.twin_price != null ? Number(p.twin_price) : null,
            triple_price: p.triple_price != null ? Number(p.triple_price) : null,
            quadruple_price: p.quadruple_price != null ? Number(p.quadruple_price) : null,
            fit_git: p.fit_git ?? "",
            note: p.note ?? "",
          });
        }

        // Sort prices within each season: FIT first → GIT → All Year → rest,
        // then by room_desc, then by meal_plan
        for (const block of seasonMap.values()) {
          block.prices.sort((a, b) => {
            const fgA = fitGitOrder.indexOf(a.fit_git) === -1 ? 999 : fitGitOrder.indexOf(a.fit_git);
            const fgB = fitGitOrder.indexOf(b.fit_git) === -1 ? 999 : fitGitOrder.indexOf(b.fit_git);
            if (fgA !== fgB) return fgA - fgB;
            const roomCmp = a.room_desc.localeCompare(b.room_desc);
            if (roomCmp !== 0) return roomCmp;
            return a.meal_plan.localeCompare(b.meal_plan);
          });
        }

        const blocks = Array.from(seasonMap.values());
        setSeasons(blocks.length > 0 ? blocks : []);

        // Populate setup fields from loaded data
        if (blocks.length > 0) {
          setSetupSeasons(blocks.map((b) => b.season_code));
          const roomNames = [...new Set(blocks.flatMap((b) => b.prices.map((p) => p.room_desc)).filter(Boolean))];
          setSetupRoomTypes(roomNames.length > 0 ? roomNames : [""]);
          const meals = [...new Set(blocks.flatMap((b) => b.prices.map((p) => p.meal_plan)).filter(Boolean))];
          setSetupMealPlans(meals.length > 0 ? meals : ["BB", "HB"]);
          const fgs = fitGitOrder.filter((fg) =>
            blocks.some((b) => b.prices.some((p) => p.fit_git === fg))
          );
          setSetupFitGit(fgs);
        }
      })
      .catch(() => setError("Failed to load hotel"))
      .finally(() => setLoading(false));
  }, [hotelId]);

  /** Resolve base prices for a room/meal/fitgit, walking up the room add-on chain. */
  function getBasePrices(
    prices: PriceRow[],
    roomDesc: string,
    mealPlan: string,
    fitGit: string,
  ): PriceSet {
    const row = prices.find(
      (p) => p.room_desc.trim() === roomDesc.trim() && p.meal_plan === mealPlan && p.fit_git === fitGit
    );
    if (row) {
      const c = calcPrices(row);
      if (c.dbl != null || c.sgl != null || c.twn != null) return c;
    }
    // No actual prices — derive from previous room type + add-on
    const addOn = roomAddOns[roomDesc.trim()] ?? 0;
    if (addOn <= 0) return { dbl: null, sgl: null, twn: null, trp: null, quad: null };
    const roomTypes = setupRoomTypes.map((r) => r.trim()).filter(Boolean);
    const idx = roomTypes.indexOf(roomDesc.trim());
    if (idx <= 0) return { dbl: null, sgl: null, twn: null, trp: null, quad: null };
    const prev = getBasePrices(prices, roomTypes[idx - 1], mealPlan, fitGit);
    return {
      dbl: prev.dbl != null ? prev.dbl + addOn : null,
      sgl: prev.sgl != null ? prev.sgl + addOn : null,
      twn: prev.twn != null ? prev.twn + addOn : null,
      trp: prev.trp != null ? prev.trp + addOn : null,
      quad: prev.quad != null ? prev.quad + addOn : null,
    };
  }

  /** Same as getBasePrices but for flat expanded price rows (used in handleSave). */
  function getBasePricesFlat(
    prices: { room_desc: string | null; meal_plan: string | null; fit_git: string | null; season_code: string | null; double_price: number | null; single_price: number | null; twin_price: number | null; triple_price: number | null; quadruple_price: number | null }[],
    roomDesc: string,
    mealPlan: string,
    fitGit: string,
    seasonCode: string,
  ): PriceSet {
    const row = prices.find(
      (p) => (p.room_desc ?? "").trim() === roomDesc.trim() && (p.meal_plan ?? "") === (mealPlan ?? "") && (p.fit_git ?? "") === (fitGit ?? "") && (p.season_code ?? "") === (seasonCode ?? "")
    );
    if (row) {
      const dbl = row.double_price != null ? Number(row.double_price) : null;
      const sgl = row.single_price != null ? Number(row.single_price) : null;
      const twn = row.twin_price != null ? Number(row.twin_price) : null;
      const trp = row.triple_price != null ? Number(row.triple_price) : null;
      const quad = row.quadruple_price != null ? Number(row.quadruple_price) : null;
      if (dbl != null || sgl != null || twn != null) return { dbl, sgl, twn, trp, quad };
    }
    const addOn = roomAddOns[roomDesc.trim()] ?? 0;
    if (addOn <= 0) return { dbl: null, sgl: null, twn: null, trp: null, quad: null };
    const roomTypes = setupRoomTypes.map((r) => r.trim()).filter(Boolean);
    const idx = roomTypes.indexOf(roomDesc.trim());
    if (idx <= 0) return { dbl: null, sgl: null, twn: null, trp: null, quad: null };
    const prev = getBasePricesFlat(prices, roomTypes[idx - 1], mealPlan, fitGit, seasonCode);
    return {
      dbl: prev.dbl != null ? prev.dbl + addOn : null,
      sgl: prev.sgl != null ? prev.sgl + addOn : null,
      twn: prev.twn != null ? prev.twn + addOn : null,
      trp: prev.trp != null ? prev.trp + addOn : null,
      quad: prev.quad != null ? prev.quad + addOn : null,
    };
  }

  /* ── auto-add rows when a new room type is entered (only if grid exists) ── */
  function ensureRoomTypeRows(roomDesc: string) {
    const name = roomDesc.trim();
    if (!name) return;

    // Snapshot meal plans now (avoid stale closure)
    const meals = setupMealPlans.length > 0 ? [...setupMealPlans] : ["BB"];

    setSeasons((prev) => {
      if (prev.length === 0) return prev;

      return prev.map((season) => {
        // Derive FIT/GIT values from existing rows in this season
        const existingFgs = [...new Set(season.prices.map((p) => p.fit_git))];
        const fgs = existingFgs.length > 0 ? existingFgs : [""];

        const updated = [...season.prices];
        let changed = false;

        for (const fg of fgs) {
          for (const mp of meals) {
            const exists = updated.some(
              (p) => p.room_desc === name && p.meal_plan === mp && p.fit_git === fg
            );
            if (!exists) {
              updated.push({
                ...emptyPriceRow(),
                room_desc: name,
                meal_plan: mp,
                fit_git: fg,
              });
              changed = true;
            }
          }
        }

        return changed ? { ...season, prices: updated } : season;
      });
    });
  }

  /* ── generate grid from setup ── */
  function generateGrid() {
    const sCodes = setupSeasons.filter((s) => s.trim());
    const rTypes = setupRoomTypes.filter((r) => r.trim());
    const meals = setupMealPlans.length > 0 ? setupMealPlans : [""];
    const fgs = setupFitGit.length > 0
      ? FIT_GIT_OPTIONS.filter((o) => setupFitGit.includes(o))
      : [""];
    if (sCodes.length === 0 || rTypes.length === 0) return;

    const newSeasons: SeasonBlock[] = sCodes.map((code) => ({
      season_code: code.trim(),
      date_ranges: [{ date_from: null, date_to: null }],
      prices: fgs.flatMap((fg) =>
        rTypes.flatMap((rt) =>
          meals.map((mp) => ({
            ...emptyPriceRow(),
            room_desc: rt.trim(),
            meal_plan: mp,
            fit_git: fg === "All Year" ? "All Year" : fg,
          }))
        )
      ),
    }));

    setSeasons(newSeasons);
  }

  /* ── season helpers ── */

  function updateSeason(sIdx: number, updates: Partial<SeasonBlock>) {
    setSeasons((prev) => prev.map((s, i) => (i === sIdx ? { ...s, ...updates } : s)));
  }

  function removeSeason(sIdx: number) {
    setSeasons((prev) => prev.filter((_, i) => i !== sIdx));
  }

  /* date ranges */
  function addDateRange(sIdx: number) {
    setSeasons((prev) =>
      prev.map((s, i) =>
        i === sIdx ? { ...s, date_ranges: [...s.date_ranges, { date_from: null, date_to: null }] } : s
      )
    );
  }

  function updateDateRange(sIdx: number, drIdx: number, field: keyof ParsedDateRange, value: string) {
    setSeasons((prev) =>
      prev.map((s, i) =>
        i === sIdx
          ? {
              ...s,
              date_ranges: s.date_ranges.map((dr, j) =>
                j === drIdx ? { ...dr, [field]: value || null } : dr
              ),
            }
          : s
      )
    );
  }

  function removeDateRange(sIdx: number, drIdx: number) {
    setSeasons((prev) =>
      prev.map((s, i) =>
        i === sIdx ? { ...s, date_ranges: s.date_ranges.filter((_, j) => j !== drIdx) } : s
      )
    );
  }

  /* price rows within a season */
  function addPriceRow(sIdx: number) {
    setSeasons((prev) =>
      prev.map((s, i) =>
        i === sIdx ? { ...s, prices: [...s.prices, emptyPriceRow()] } : s
      )
    );
  }

  /* ── ensure HB rows exist when supplement is entered ── */
  function ensureHbRows(supp: number | null) {
    setHbSupplement(supp);
    if (!supp || supp <= 0) return;

    setSeasons((prev) =>
      prev.map((season) => {
        const bbRows = season.prices.filter((p) => p.meal_plan === "BB");
        if (bbRows.length === 0) return season;

        const updated = [...season.prices];
        let changed = false;

        for (const bb of bbRows) {
          const exists = updated.some(
            (p) => p.meal_plan === "HB" && p.room_desc === bb.room_desc && p.fit_git === bb.fit_git
          );
          if (!exists) {
            const idx = updated.indexOf(bb);
            updated.splice(idx + 1, 0, {
              ...emptyPriceRow(),
              room_desc: bb.room_desc,
              fit_git: bb.fit_git,
              meal_plan: "HB",
            });
            changed = true;
          }
        }

        return changed ? { ...season, prices: updated } : season;
      })
    );
  }

  function updatePriceRow(sIdx: number, pIdx: number, updates: Partial<PriceRow>) {
    setSeasons((prev) =>
      prev.map((s, i) =>
        i === sIdx
          ? { ...s, prices: s.prices.map((p, j) => (j === pIdx ? { ...p, ...updates } : p)) }
          : s
      )
    );
  }

  function removePriceRow(sIdx: number, pIdx: number) {
    setSeasons((prev) =>
      prev.map((s, i) =>
        i === sIdx ? { ...s, prices: s.prices.filter((_, j) => j !== pIdx) } : s
      )
    );
  }

  function movePriceRow(sIdx: number, pIdx: number, dir: -1 | 1) {
    setSeasons((prev) =>
      prev.map((s, i) => {
        if (i !== sIdx) return s;
        const target = pIdx + dir;
        if (target < 0 || target >= s.prices.length) return s;
        const prices = [...s.prices];
        [prices[pIdx], prices[target]] = [prices[target], prices[pIdx]];
        return { ...s, prices };
      })
    );
  }

  /* ── fill remaining dates ── */
  function fillRemainingDates(sIdx: number) {
    const occupied: { from: Date; to: Date }[] = [];
    for (let i = 0; i < seasons.length; i++) {
      if (i === sIdx) continue;
      for (const dr of seasons[i].date_ranges) {
        if (dr.date_from && dr.date_to) {
          occupied.push({
            from: new Date(dr.date_from + "T00:00:00"),
            to: new Date(dr.date_to + "T00:00:00"),
          });
        }
      }
    }

    occupied.sort((a, b) => a.from.getTime() - b.from.getTime());

    // Determine contract year (Nov 1 – Oct 31)
    // Use earliest occupied date as reference, or the current season's
    // first date, or today as fallback
    let refDate: Date;
    if (occupied.length > 0) {
      refDate = occupied[0].from;
    } else {
      const ownDr = seasons[sIdx].date_ranges.find((dr) => dr.date_from);
      refDate = ownDr ? new Date(ownDr.date_from + "T00:00:00") : new Date();
    }

    let contractStart: Date;
    let contractEnd: Date;
    if (refDate.getMonth() >= 10) {
      contractStart = new Date(refDate.getFullYear(), 10, 1);
      contractEnd = new Date(refDate.getFullYear() + 1, 9, 31);
    } else {
      contractStart = new Date(refDate.getFullYear() - 1, 10, 1);
      contractEnd = new Date(refDate.getFullYear(), 9, 31);
    }

    // Find gaps between occupied ranges within contract year
    const gaps: { from: Date; to: Date }[] = [];
    let cursor = new Date(contractStart);

    for (const period of occupied) {
      const pFrom = period.from < contractStart ? contractStart : period.from;
      const pTo = period.to > contractEnd ? contractEnd : period.to;
      if (pFrom > cursor && cursor <= contractEnd) {
        const gapEnd = new Date(pFrom);
        gapEnd.setDate(gapEnd.getDate() - 1);
        gaps.push({
          from: new Date(cursor),
          to: gapEnd > contractEnd ? new Date(contractEnd) : gapEnd,
        });
      }
      const dayAfter = new Date(pTo);
      dayAfter.setDate(dayAfter.getDate() + 1);
      if (dayAfter > cursor) cursor = dayAfter;
    }

    if (cursor <= contractEnd) {
      gaps.push({ from: new Date(cursor), to: new Date(contractEnd) });
    }

    if (gaps.length === 0) return;

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dy = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dy}`;
    };

    updateSeason(sIdx, {
      date_ranges: gaps.map((g) => ({ date_from: fmt(g.from), date_to: fmt(g.to) })),
    });
  }

  /* ── save ── */
  async function handleSave(andNavigate = true) {
    setError(null);
    setSaved(false);
    if (!name.trim()) { setError("Hotel name is required"); setActiveTab("info"); return; }
    if (!city.trim()) { setError("City is required"); setActiveTab("info"); return; }

    // Check for overlapping date ranges across seasons
    const allRanges: { from: Date; to: Date; season: string }[] = [];
    for (const s of seasons) {
      for (const dr of s.date_ranges) {
        if (dr.date_from && dr.date_to) {
          allRanges.push({
            from: new Date(dr.date_from + "T00:00:00"),
            to: new Date(dr.date_to + "T00:00:00"),
            season: s.season_code || "(unnamed)",
          });
        }
      }
    }
    for (let i = 0; i < allRanges.length; i++) {
      for (let j = i + 1; j < allRanges.length; j++) {
        const a = allRanges[i], b = allRanges[j];
        if (a.from < b.to && b.from < a.to) {
          const fmt = (d: Date) => d.toISOString().slice(0, 10);
          alert(
            `Season dates overlap!\n\n` +
            `"${a.season}" (${fmt(a.from)} – ${fmt(a.to)})\noverlaps with\n"${b.season}" (${fmt(b.from)} – ${fmt(b.to)})\n\n` +
            `Seasons are not allowed to overlap. Please fix the dates before saving.`
          );
          setActiveTab("prices");
          return;
        }
      }
    }

    setSaving(true);
    try {
      const basePrices = expandSeasons(seasons);
      const tax = hotelTax ?? 0;

      const hbSupp = hbSupplement ?? 0;

      // Resolve prices: room add-on chains, auto-HB, then add tax
      const finalPrices = basePrices.map((p) => {
        const dbl = p.double_price != null ? Number(p.double_price) : null;
        const sgl = p.single_price != null ? Number(p.single_price) : null;
        const twn = p.twin_price != null ? Number(p.twin_price) : null;
        const trp = p.triple_price != null ? Number(p.triple_price) : null;
        const quad = p.quadruple_price != null ? Number(p.quadruple_price) : null;
        const rd = (p.room_desc ?? "").trim();
        const sc = p.season_code ?? "";

        // Row has actual prices → just add tax
        if (dbl != null || sgl != null || twn != null) {
          return {
            ...p,
            double_price: dbl != null ? Math.round(dbl + 2 * tax) : null,
            single_price: sgl != null ? Math.round(sgl + tax) : null,
            twin_price: twn != null ? Math.round(twn + 2 * tax) : null,
            triple_price: trp,
            quadruple_price: quad,
          };
        }

        // Auto-HB: HB with null prices → derive from BB (which may be add-on-derived)
        if (p.meal_plan === "HB" && hbSupp > 0) {
          const bb = getBasePricesFlat(basePrices, rd, "BB", p.fit_git ?? "", sc);
          if (bb.dbl != null || bb.sgl != null || bb.twn != null) {
            return {
              ...p,
              double_price: bb.dbl != null ? Math.round(bb.dbl + 2 * tax + hbSupp) : null,
              single_price: bb.sgl != null ? Math.round(bb.sgl + tax + hbSupp) : null,
              twin_price: bb.twn != null ? Math.round(bb.twn + 2 * tax + hbSupp) : null,
              triple_price: bb.trp,
              quadruple_price: bb.quad,
            };
          }
        }

        // Auto room add-on: null prices → derive from previous room type
        const resolved = getBasePricesFlat(basePrices, rd, p.meal_plan ?? "", p.fit_git ?? "", sc);
        if (resolved.dbl != null || resolved.sgl != null || resolved.twn != null) {
          return {
            ...p,
            double_price: resolved.dbl != null ? Math.round(resolved.dbl + 2 * tax) : null,
            single_price: resolved.sgl != null ? Math.round(resolved.sgl + tax) : null,
            twin_price: resolved.twn != null ? Math.round(resolved.twn + 2 * tax) : null,
            triple_price: resolved.trp,
            quadruple_price: resolved.quad,
          };
        }

        // No prices resolvable
        return p;
      });

      const payload = {
        name: name.trim(),
        city: city.trim(),
        stars,
        type: type || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        country: country || null,
        postal_code: postalCode || null,
        state: hotelState || null,
        prices: finalPrices,
      };
      if (isEdit) {
        await updateHotelWithPrices(Number(hotelId), payload);
      } else {
        await createHotelWithPrices(payload);
      }
      if (andNavigate) {
        navigate("/prices");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save hotel");
    } finally {
      setSaving(false);
    }
  }

  /* ── render ── */
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "0.6rem 1.5rem",
    border: "none",
    borderBottom: active ? "3px solid #e94560" : "3px solid transparent",
    background: "none",
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
    fontSize: "0.95rem",
    color: active ? "#e94560" : "#666",
  });

  if (loading) return <p style={{ color: "#888" }}>Loading hotel...</p>;

  const totalRows = seasons.reduce((n, s) => n + s.prices.length, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>{isEdit ? "Edit Hotel" : "Add Hotel"}</h2>
        {isEdit && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              onClick={async () => {
                setPushing(true);
                try {
                  const res = await pushHotelToCmr(Number(hotelId));
                  setPushSnackbar({ msg: res.message, ok: true });
                  if (res.cmr_supplier_id) {
                    setCmrSupplierId(res.cmr_supplier_id);
                  }
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : "Push failed";
                  setPushSnackbar({ msg, ok: false });
                } finally {
                  setPushing(false);
                  setTimeout(() => setPushSnackbar(null), 4000);
                }
              }}
              disabled={pushing}
              style={{
                padding: "0.5rem 1.2rem",
                background: pushing ? "#999" : cmrSupplierId ? "#059669" : "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: pushing ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              {pushing ? "Syncing..." : cmrSupplierId ? "Update CRM" : "Push to CRM"}
            </button>
            {cmrSupplierId && (
              <a
                href="https://crm.vmmorocco.com/suppliers?category=Accommodation"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "0.5rem 1.2rem",
                  background: "none",
                  border: "1px solid #059669",
                  color: "#059669",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  textDecoration: "none",
                }}
              >
                View in CRM
              </a>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "0.75rem 1rem", borderRadius: 6, marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      <div style={{ borderBottom: "1px solid #ddd", marginBottom: "1.5rem" }}>
        <button style={tabBtn(activeTab === "info")} onClick={() => setActiveTab("info")}>Hotel Info</button>
        <button style={tabBtn(activeTab === "prices")} onClick={() => setActiveTab("prices")}>
          Prices ({totalRows} rows in {seasons.length} seasons)
        </button>
      </div>

      {/* ──────── Tab 1: Hotel Info ──────── */}
      {activeTab === "info" && (
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div ref={placesRef} style={{ position: "relative" }}>
              <label style={lbl}>Hotel Name *</label>
              <input
                style={inp}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => { if (placePredictions.length > 0) setShowPlaces(true); }}
                placeholder="e.g. Hotel Marrakech Palace"
              />
              {loadingDetails && (
                <span style={{ position: "absolute", right: 8, top: 24, fontSize: "0.7rem", color: "#888" }}>Loading...</span>
              )}
              {placesLoading && !loadingDetails && name.trim().length >= 2 && (
                <span style={{ position: "absolute", right: 8, top: 24, fontSize: "0.7rem", color: "#bbb" }}>Searching...</span>
              )}
              {showPlaces && placePredictions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 200,
                    background: "#fff",
                    border: "1px solid #ddd",
                    borderTop: "none",
                    borderRadius: "0 0 6px 6px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  {placePredictions.map((p) => (
                    <div
                      key={p.place_id}
                      onClick={() => handleSelectPlace(p)}
                      style={{
                        padding: "0.5rem 0.75rem",
                        cursor: "pointer",
                        fontSize: "0.82rem",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f4ff")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                    >
                      {p.description}
                    </div>
                  ))}
                  <div style={{ padding: "0.3rem 0.75rem", fontSize: "0.65rem", color: "#aaa", textAlign: "right" }}>
                    Powered by Google
                  </div>
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>City *</label>
              <input style={inp} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Marrakech" />
            </div>
            <div>
              <label style={lbl}>Stars</label>
              <select style={sel} value={stars ?? ""} onChange={(e) => setStars(e.target.value ? Number(e.target.value) : null)}>
                <option value="">--</option>
                {[1, 2, 3, 4, 5].map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            <div>
              <label style={lbl}>Type</label>
              {customType ? (
                <input
                  style={inp}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder="Enter new type..."
                  autoFocus
                  onBlur={() => { if (!type) setCustomType(false); }}
                />
              ) : (
                <select
                  style={sel}
                  value={type && HOTEL_TYPES.includes(type) ? type : type ? "__custom__" : ""}
                  onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setType("");
                      setCustomType(true);
                    } else if (e.target.value === "__custom__") {
                      // already custom, ignore
                    } else {
                      setType(e.target.value);
                    }
                  }}
                >
                  <option value="">--</option>
                  {HOTEL_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  {type && !HOTEL_TYPES.includes(type) && (
                    <option value="__custom__">{type}</option>
                  )}
                  <option value="__new__">+ Add new...</option>
                </select>
              )}
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Address</label>
              <input style={inp} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input style={inp} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Email</label>
              <input style={inp} value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </div>
            <div>
              <label style={lbl}>Country</label>
              <input style={inp} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Morocco" />
            </div>
            <div>
              <label style={lbl}>State / Province</label>
              <input style={inp} value={hotelState} onChange={(e) => setHotelState(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Postal Code</label>
              <input style={inp} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
          </div>

          {matchedHotel && !isEdit && (
            <div
              style={{
                marginTop: "1rem",
                padding: "1rem 1.25rem",
                background: "#fff8e1",
                border: "1px solid #ffe082",
                borderRadius: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#e65100" }}>
                  A similar hotel already exists
                </div>
                <button
                  onClick={() => {
                    setDismissedMatch(matchedHotel.id);
                    setMatchedHotel(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#888",
                    fontSize: "0.8rem",
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  x
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem 2rem",
                  marginTop: "0.75rem",
                  fontSize: "0.7rem",
                }}
              >
                <div><span style={{ color: "#888" }}>Name:</span> {matchedHotel.name}</div>
                <div><span style={{ color: "#888" }}>City:</span> {matchedHotel.city || "-"}</div>
                <div><span style={{ color: "#888" }}>Stars:</span> {matchedHotel.stars ? "★".repeat(matchedHotel.stars) : "-"}</div>
                <div><span style={{ color: "#888" }}>Type:</span> {matchedHotel.type || "-"}</div>
                <div><span style={{ color: "#888" }}>Email:</span> {matchedHotel.email || "-"}</div>
                <div><span style={{ color: "#888" }}>Phone:</span> {matchedHotel.phone || "-"}</div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button
                  onClick={() => navigate(`/edit-hotel/${matchedHotel.id}`)}
                  style={{
                    padding: "0.4rem 1rem",
                    background: "#e94560",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "0.65rem",
                  }}
                >
                  Update existing hotel
                </button>
                <button
                  onClick={() => {
                    setDismissedMatch(matchedHotel.id);
                    setMatchedHotel(null);
                  }}
                  style={{
                    padding: "0.4rem 1rem",
                    background: "none",
                    color: "#666",
                    border: "1px solid #ccc",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: "0.65rem",
                  }}
                >
                  Create new anyway
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────── Tab 2: Prices ──────── */}
      {activeTab === "prices" && (
        <div>
          {/* ── Setup panel ── */}
          <div
            style={{
              ...cardStyle,
              marginBottom: "1.25rem",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
              {/* Seasons setup */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1a1a2e" }}>Seasons</span>
                  <span style={{
                    background: "#1a1a2e", color: "#fff", borderRadius: "50%",
                    width: 22, height: 22, display: "inline-flex", alignItems: "center",
                    justifyContent: "center", fontSize: "0.75rem", fontWeight: 700,
                  }}>
                    {setupSeasons.filter((s) => s.trim()).length}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
                  {setupSeasons.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                      <input
                        style={{ ...inp, width: 70, textAlign: "center", fontWeight: 600 }}
                        value={s}
                        onChange={(e) => setSetupSeasons((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                        placeholder="Code"
                      />
                      {setupSeasons.length > 1 && (
                        <button style={xBtn} onClick={() => setSetupSeasons((prev) => prev.filter((_, j) => j !== i))}>x</button>
                      )}
                    </div>
                  ))}
                  <button
                    style={{ ...dashedBtn, padding: "0.2rem 0.5rem" }}
                    onClick={() => setSetupSeasons((prev) => [...prev, ""])}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Room types setup */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1a1a2e" }}>Room Types</span>
                  <span style={{
                    background: "#1a1a2e", color: "#fff", borderRadius: "50%",
                    width: 22, height: 22, display: "inline-flex", alignItems: "center",
                    justifyContent: "center", fontSize: "0.75rem", fontWeight: 700,
                  }}>
                    {setupRoomTypes.filter((r) => r.trim()).length}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
                  {setupRoomTypes.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                      <input
                        style={{ ...inp, width: 120 }}
                        value={r}
                        onChange={(e) => setSetupRoomTypes((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                        onBlur={(e) => ensureRoomTypeRows(e.target.value)}
                        placeholder="e.g. Std"
                      />
                      {seasons.length > 0 && r.trim() && (
                        <button
                          style={{ ...dashedBtn, padding: "0.15rem 0.5rem", fontSize: "0.72rem", color: "#059669", borderColor: "#059669" }}
                          onClick={() => ensureRoomTypeRows(r)}
                        >
                          Add
                        </button>
                      )}
                      {setupRoomTypes.length > 1 && (
                        <button style={xBtn} onClick={() => setSetupRoomTypes((prev) => prev.filter((_, j) => j !== i))}>x</button>
                      )}
                    </div>
                  ))}
                  <button
                    style={{ ...dashedBtn, padding: "0.2rem 0.5rem" }}
                    onClick={() => setSetupRoomTypes((prev) => [...prev, ""])}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* FIT/GIT setup */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1a1a2e" }}>Rate Type</span>
                  <span style={{
                    background: "#1a1a2e", color: "#fff", borderRadius: "50%",
                    width: 22, height: 22, display: "inline-flex", alignItems: "center",
                    justifyContent: "center", fontSize: "0.75rem", fontWeight: 700,
                  }}>
                    {setupFitGit.length}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                  {FIT_GIT_OPTIONS.map((fg) => {
                    const active = setupFitGit.includes(fg);
                    return (
                      <button
                        key={fg}
                        onClick={() =>
                          setSetupFitGit((prev) =>
                            active ? prev.filter((v) => v !== fg) : [...prev, fg]
                          )
                        }
                        style={{
                          padding: "0.3rem 0.7rem",
                          borderRadius: 5,
                          border: active ? "2px solid #1a1a2e" : "1px solid #ccc",
                          background: active ? "#1a1a2e" : "#fff",
                          color: active ? "#fff" : "#666",
                          cursor: "pointer",
                          fontWeight: 600,
                          fontSize: "0.8rem",
                        }}
                      >
                        {fg}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Meal plans setup */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1a1a2e" }}>Meal Plans</span>
                  <span style={{
                    background: "#1a1a2e", color: "#fff", borderRadius: "50%",
                    width: 22, height: 22, display: "inline-flex", alignItems: "center",
                    justifyContent: "center", fontSize: "0.75rem", fontWeight: 700,
                  }}>
                    {setupMealPlans.length}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                  {MEAL_OPTIONS.map((mp) => {
                    const active = setupMealPlans.includes(mp);
                    return (
                      <button
                        key={mp}
                        onClick={() =>
                          setSetupMealPlans((prev) =>
                            active ? prev.filter((m) => m !== mp) : [...prev, mp]
                          )
                        }
                        style={{
                          padding: "0.3rem 0.7rem",
                          borderRadius: 5,
                          border: active ? "2px solid #1a1a2e" : "1px solid #ccc",
                          background: active ? "#1a1a2e" : "#fff",
                          color: active ? "#fff" : "#666",
                          cursor: "pointer",
                          fontWeight: 600,
                          fontSize: "0.8rem",
                        }}
                      >
                        {mp}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tax */}
              <div style={{ minWidth: 100 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1a1a2e" }}>Tax p.p.</span>
                </div>
                <input
                  style={{ ...inp, width: 90, textAlign: "right", fontWeight: 600 }}
                  type="number"
                  value={hotelTax ?? ""}
                  onChange={(e) => setHotelTax(e.target.value ? Number(e.target.value) : null)}
                  placeholder="0"
                />
              </div>

              {/* HB Supplement */}
              <div style={{ minWidth: 100 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1a1a2e" }}>HB p.p.</span>
                </div>
                <input
                  style={{ ...inp, width: 90, textAlign: "right", fontWeight: 600 }}
                  type="number"
                  value={hbSupplement ?? ""}
                  onChange={(e) => ensureHbRows(e.target.value ? Number(e.target.value) : null)}
                  placeholder="0"
                />
              </div>

              {/* Room Add-on per room type */}
              {setupRoomTypes.some((r) => r.trim()) && (
                <div style={{ minWidth: 160 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1a1a2e" }}>Room Add-on</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {setupRoomTypes.filter((r) => r.trim()).map((rt) => {
                      const key = rt.trim();
                      return (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ fontSize: "0.8rem", color: "#555", minWidth: 90, fontWeight: 500 }}>{key}</span>
                          <input
                            style={{ ...inp, width: 80, textAlign: "right", fontWeight: 600 }}
                            type="number"
                            value={roomAddOns[key] ?? ""}
                            onChange={(e) => setRoomAddOns((prev) => {
                              const val = e.target.value ? Number(e.target.value) : 0;
                              if (!val) { const next = { ...prev }; delete next[key]; return next; }
                              return { ...prev, [key]: val };
                            })}
                            placeholder="0"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Generate button row */}
            <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
              {(() => {
                const nS = setupSeasons.filter((s) => s.trim()).length;
                const nR = setupRoomTypes.filter((r) => r.trim()).length;
                const nM = setupMealPlans.length || 1;
                const nF = setupFitGit.length || 1;
                const canGen = nS > 0 && nR > 0;
                const totalRows = nS * nR * nM * nF;
                return (
                  <>
                    <button
                      onClick={generateGrid}
                      disabled={!canGen}
                      style={{
                        background: canGen ? "#e94560" : "#ccc",
                        color: "#fff",
                        border: "none",
                        padding: "0.5rem 1.2rem",
                        borderRadius: 6,
                        cursor: canGen ? "pointer" : "not-allowed",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Generate Grid
                    </button>
                    <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
                      {nS} season{nS !== 1 ? "s" : ""} x {nR} room{nR !== 1 ? "s" : ""} x {nM} meal{nM !== 1 ? "s" : ""}{nF > 1 ? ` x ${nF} rate types` : ""} = <b>{totalRows} price rows</b>
                    </span>
                  </>
                );
              })()}
            </div>

            {seasons.length > 0 && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.78rem", color: "#94a3b8" }}>
                Grid active. You can still add/remove rows manually in each season below.
              </div>
            )}
          </div>

          {seasons.length === 0 && (
            <div style={{ ...cardStyle, color: "#888", textAlign: "center", padding: "3rem", marginBottom: "1rem" }}>
              Define your seasons and room types above, then click "Generate Grid" to create the price boxes.
            </div>
          )}

          {seasons.map((season, sIdx) => (
            <div key={sIdx} style={{ ...cardStyle, marginBottom: "1.25rem", padding: 0, overflow: "hidden" }}>

              {/* ── Season header ── */}
              <div
                style={{
                  background: "#1a1a2e",
                  color: "#fff",
                  padding: "0.6rem 1rem",
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "0.85rem", minWidth: 55 }}>Season</span>
                <input
                  style={{ ...inp, width: 80, background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}
                  value={season.season_code}
                  onChange={(e) => updateSeason(sIdx, { season_code: e.target.value })}
                  placeholder="Code"
                />
                {season.date_ranges.map((dr, drIdx) => (
                  <div key={drIdx} style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                    <input
                      style={{ ...inp, width: 140, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}
                      type="date"
                      value={dr.date_from ?? ""}
                      onChange={(e) => updateDateRange(sIdx, drIdx, "date_from", e.target.value)}
                    />
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8rem" }}>-</span>
                    <input
                      style={{ ...inp, width: 140, background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}
                      type="date"
                      value={dr.date_to ?? ""}
                      onChange={(e) => updateDateRange(sIdx, drIdx, "date_to", e.target.value)}
                    />
                    {season.date_ranges.length > 1 && (
                      <button style={{ ...xBtn, color: "#fca5a5" }} onClick={() => removeDateRange(sIdx, drIdx)}>x</button>
                    )}
                  </div>
                ))}
                <button
                  style={{ ...dashedBtn, borderColor: "rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.7)", fontSize: "0.72rem", padding: "0.15rem 0.5rem" }}
                  onClick={() => addDateRange(sIdx)}
                >
                  + Date
                </button>
                <button
                  style={{
                    background: "rgba(74,222,128,0.2)",
                    color: "#86efac",
                    border: "1px solid rgba(74,222,128,0.3)",
                    padding: "0.15rem 0.6rem",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                  onClick={() => fillRemainingDates(sIdx)}
                  title="Fill gaps not covered by other seasons (Nov 1 – Oct 31)"
                >
                  Fill remaining
                </button>
                <div style={{ flex: 1 }} />
                {seasons.length > 1 && (
                  <button
                    onClick={() => removeSeason(sIdx)}
                    style={{ background: "rgba(239,68,68,0.2)", color: "#fca5a5", border: "none", padding: "0.2rem 0.6rem", borderRadius: 4, cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}
                  >
                    Delete Season
                  </button>
                )}
              </div>

              {/* ── Price rows table ── */}
              <div style={{ padding: "0.75rem 1rem" }}>
                {/* Column headers */}
                <div
                  style={{
                    display: "flex",
                    gap: "0.4rem",
                    alignItems: "flex-end",
                    marginBottom: "0.4rem",
                    paddingBottom: "0.3rem",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <div style={{ width: 160, flex: 1 }}><span style={lbl}>Room Type</span></div>
                  <div style={{ width: 65 }}><span style={lbl}>Meal</span></div>
                  <div style={{ width: 110 }}><span style={lbl}>Mode</span></div>
                  <div style={{ width: 80 }}>
                    <span style={lbl}>Dbl</span>
                    {(hotelTax ?? 0) > 0 && <span style={{ fontSize: "0.6rem", color: "#059669", fontWeight: 700 }}> +{2 * hotelTax!}</span>}
                  </div>
                  <div style={{ width: 80 }}>
                    <span style={lbl}>Sgl</span>
                    {(hotelTax ?? 0) > 0 && <span style={{ fontSize: "0.6rem", color: "#059669", fontWeight: 700 }}> +{hotelTax}</span>}
                  </div>
                  <div style={{ width: 80 }}>
                    <span style={lbl}>Twin</span>
                    {(hotelTax ?? 0) > 0 && <span style={{ fontSize: "0.6rem", color: "#059669", fontWeight: 700 }}> +{2 * hotelTax!}</span>}
                  </div>
                  <div style={{ width: 80 }}>
                    <span style={lbl}>Trp</span>
                  </div>
                  <div style={{ width: 80 }}>
                    <span style={lbl}>Quad</span>
                  </div>
                  <div style={{ width: 65 }}><span style={lbl}>FIT</span></div>
                  <div style={{ width: 120 }}><span style={lbl}>Note</span></div>
                  <div style={{ width: 60 }} />
                </div>

                {/* Rows */}
                {season.prices.map((row, pIdx) => {
                  const c = calcPrices(row);
                  const tax = hotelTax ?? 0;
                  const hb = hbSupplement ?? 0;
                  const hasManualPrices = c.dbl != null || c.sgl != null || c.twn != null || c.trp != null || c.quad != null;

                  // Auto-HB: HB with null prices + HB supplement set
                  const autoHb =
                    !hasManualPrices &&
                    row.meal_plan === "HB" &&
                    hb > 0 &&
                    row.pricing_mode === "per_room";

                  // Auto Room Add-on: null prices + room has add-on + previous room exists
                  const addOnAmount = roomAddOns[row.room_desc.trim()] ?? 0;
                  const autoRoom =
                    !hasManualPrices &&
                    !autoHb &&
                    addOnAmount > 0 &&
                    row.pricing_mode === "per_room";

                  const isAuto = autoHb || autoRoom;

                  // Calculate auto prices
                  let autoPrices: PriceSet = { dbl: null, sgl: null, twn: null, trp: null, quad: null };
                  if (autoHb) {
                    // HB = BB base (resolved through add-on chain) + tax + HB supplement
                    const bb = getBasePrices(season.prices, row.room_desc, "BB", row.fit_git);
                    autoPrices = {
                      dbl: bb.dbl != null ? Math.round(bb.dbl + 2 * tax + hb) : null,
                      sgl: bb.sgl != null ? Math.round(bb.sgl + tax + hb) : null,
                      twn: bb.twn != null ? Math.round(bb.twn + 2 * tax + hb) : null,
                      trp: bb.trp,
                      quad: bb.quad,
                    };
                  } else if (autoRoom) {
                    // Room = previous room base (resolved) + add-on + tax
                    const resolved = getBasePrices(season.prices, row.room_desc, row.meal_plan, row.fit_git);
                    autoPrices = {
                      dbl: resolved.dbl != null ? Math.round(resolved.dbl + 2 * tax) : null,
                      sgl: resolved.sgl != null ? Math.round(resolved.sgl + tax) : null,
                      twn: resolved.twn != null ? Math.round(resolved.twn + 2 * tax) : null,
                      trp: resolved.trp,
                      quad: resolved.quad,
                    };
                  }

                  // Green calculated box style
                  const greenBox: React.CSSProperties = { ...num, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#333", fontWeight: 600, padding: "0.4rem 0.5rem" };
                  // "= total" box style — prominent green badge
                  const totalBox: React.CSSProperties = {
                    background: "#dcfce7", border: "1px solid #86efac", borderRadius: 3,
                    padding: "0.2rem 0.4rem", fontSize: "0.78rem", fontWeight: 700,
                    color: "#166534", textAlign: "right", marginTop: 2,
                  };

                  return (
                    <div key={pIdx} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start", marginBottom: "0.35rem" }}>
                      {/* Room Type */}
                      <div style={{ width: 160, flex: 1 }}>
                        <input style={inp} value={row.room_desc} onChange={(e) => updatePriceRow(sIdx, pIdx, { room_desc: e.target.value })} placeholder="e.g. Std" />
                      </div>

                      {/* Meal */}
                      <div style={{ width: 65 }}>
                        <select style={sel} value={row.meal_plan} onChange={(e) => updatePriceRow(sIdx, pIdx, { meal_plan: e.target.value })}>
                          <option value="">--</option>
                          <option value="RO">RO</option>
                          <option value="BB">BB</option>
                          <option value="HB">HB</option>
                          <option value="FB">FB</option>
                          <option value="AI">AI</option>
                        </select>
                      </div>

                      {/* Mode */}
                      <div style={{ width: 110 }}>
                        <select
                          style={sel}
                          value={row.pricing_mode}
                          onChange={(e) => {
                            const mode = e.target.value as PricingMode;
                            updatePriceRow(sIdx, pIdx, {
                              pricing_mode: mode,
                              base_price: null, tax: null, sgl_supplement: null,
                              double_price: null, single_price: null, twin_price: null,
                            });
                          }}
                        >
                          <option value="per_room">Per Room</option>
                          <option value="per_person">Per Person</option>
                          <option value="half_double">&frac12; Double</option>
                        </select>
                      </div>

                      {/* Dbl / Sgl / Twin — per_room */}
                      {row.pricing_mode === "per_room" && (
                        isAuto ? (
                          <>
                            <div style={{ width: 80 }}>
                              <div style={greenBox}>{autoPrices.dbl?.toFixed(0) ?? "-"}</div>
                            </div>
                            <div style={{ width: 80 }}>
                              <div style={greenBox}>{autoPrices.sgl?.toFixed(0) ?? "-"}</div>
                            </div>
                            <div style={{ width: 80 }}>
                              <div style={greenBox}>{autoPrices.twn?.toFixed(0) ?? "-"}</div>
                            </div>
                            <div style={{ width: 80 }}>
                              <div style={greenBox}>{autoPrices.trp?.toFixed(0) ?? "-"}</div>
                            </div>
                            <div style={{ width: 80 }}>
                              <div style={greenBox}>{autoPrices.quad?.toFixed(0) ?? "-"}</div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ width: 80 }}>
                              <input style={num} type="number" value={row.double_price ?? ""}
                                onChange={(e) => updatePriceRow(sIdx, pIdx, { double_price: e.target.value ? Number(e.target.value) : null })} />
                              {tax > 0 && row.double_price != null && (
                                <div style={totalBox}>= {Math.round(row.double_price + 2 * tax)}</div>
                              )}
                            </div>
                            <div style={{ width: 80 }}>
                              <input style={num} type="number" value={row.single_price ?? ""}
                                onChange={(e) => updatePriceRow(sIdx, pIdx, { single_price: e.target.value ? Number(e.target.value) : null })} />
                              {tax > 0 && row.single_price != null && (
                                <div style={totalBox}>= {Math.round(row.single_price + tax)}</div>
                              )}
                            </div>
                            <div style={{ width: 80 }}>
                              <input style={num} type="number" value={row.twin_price ?? ""}
                                onChange={(e) => updatePriceRow(sIdx, pIdx, { twin_price: e.target.value ? Number(e.target.value) : null })} />
                              {tax > 0 && row.twin_price != null && (
                                <div style={totalBox}>= {Math.round(row.twin_price + 2 * tax)}</div>
                              )}
                            </div>
                            <div style={{ width: 80 }}>
                              <input style={num} type="number" value={row.triple_price ?? ""}
                                onChange={(e) => updatePriceRow(sIdx, pIdx, { triple_price: e.target.value ? Number(e.target.value) : null })} />
                            </div>
                            <div style={{ width: 80 }}>
                              <input style={num} type="number" value={row.quadruple_price ?? ""}
                                onChange={(e) => updatePriceRow(sIdx, pIdx, { quadruple_price: e.target.value ? Number(e.target.value) : null })} />
                            </div>
                          </>
                        )
                      )}

                      {/* Dbl / Sgl / Twin / Trp / Quad — per_person */}
                      {row.pricing_mode === "per_person" && (
                        <>
                          <div style={{ width: 80 }}>
                            <div style={greenBox}>{c.dbl?.toFixed(0) ?? "-"}</div>
                            {tax > 0 && c.dbl != null && (
                              <div style={totalBox}>= {Math.round(c.dbl + 2 * tax)}</div>
                            )}
                          </div>
                          <div style={{ width: 80 }}>
                            <div style={greenBox}>{c.sgl?.toFixed(0) ?? "-"}</div>
                            {tax > 0 && c.sgl != null && (
                              <div style={totalBox}>= {Math.round(c.sgl + tax)}</div>
                            )}
                          </div>
                          <div style={{ width: 80 }}>
                            <div style={greenBox}>{c.twn?.toFixed(0) ?? "-"}</div>
                            {tax > 0 && c.twn != null && (
                              <div style={totalBox}>= {Math.round(c.twn + 2 * tax)}</div>
                            )}
                          </div>
                          <div style={{ width: 80 }}>
                            <input style={num} type="number" value={row.triple_price ?? ""}
                              onChange={(e) => updatePriceRow(sIdx, pIdx, { triple_price: e.target.value ? Number(e.target.value) : null })} />
                          </div>
                          <div style={{ width: 80 }}>
                            <input style={num} type="number" value={row.quadruple_price ?? ""}
                              onChange={(e) => updatePriceRow(sIdx, pIdx, { quadruple_price: e.target.value ? Number(e.target.value) : null })} />
                          </div>
                        </>
                      )}

                      {/* Dbl / Sgl / Twin / Trp / Quad — half_double */}
                      {row.pricing_mode === "half_double" && (
                        <>
                          <div style={{ width: 80 }}>
                            <div style={greenBox}>{c.dbl?.toFixed(0) ?? "-"}</div>
                            {tax > 0 && c.dbl != null && (
                              <div style={totalBox}>= {Math.round(c.dbl + 2 * tax)}</div>
                            )}
                          </div>
                          <div style={{ width: 80 }}>
                            <div style={greenBox}>{c.sgl?.toFixed(0) ?? "-"}</div>
                            {tax > 0 && c.sgl != null && (
                              <div style={totalBox}>= {Math.round(c.sgl + tax)}</div>
                            )}
                          </div>
                          <div style={{ width: 80 }}>
                            <div style={greenBox}>{c.twn?.toFixed(0) ?? "-"}</div>
                            {tax > 0 && c.twn != null && (
                              <div style={totalBox}>= {Math.round(c.twn + 2 * tax)}</div>
                            )}
                          </div>
                          <div style={{ width: 80 }}>
                            <input style={num} type="number" value={row.triple_price ?? ""}
                              onChange={(e) => updatePriceRow(sIdx, pIdx, { triple_price: e.target.value ? Number(e.target.value) : null })} />
                          </div>
                          <div style={{ width: 80 }}>
                            <input style={num} type="number" value={row.quadruple_price ?? ""}
                              onChange={(e) => updatePriceRow(sIdx, pIdx, { quadruple_price: e.target.value ? Number(e.target.value) : null })} />
                          </div>
                        </>
                      )}

                      {/* FIT */}
                      <div style={{ width: 65 }}>
                        <select style={sel} value={row.fit_git} onChange={(e) => updatePriceRow(sIdx, pIdx, { fit_git: e.target.value })}>
                          <option value="">--</option>
                          <option value="FIT">FIT</option>
                          <option value="GIT">GIT</option>
                          <option value="All Year">All Year</option>
                        </select>
                      </div>

                      {/* Note */}
                      <div style={{ width: 120 }}>
                        <NoteCell
                          value={row.note}
                          onChange={(v) => updatePriceRow(sIdx, pIdx, { note: v })}
                        />
                      </div>

                      {/* Row controls */}
                      <div style={{ width: 60, display: "flex", alignItems: "center", gap: "0.1rem", paddingTop: 2 }}>
                        <button
                          style={{ ...xBtn, color: "#666", fontSize: "0.75rem" }}
                          onClick={() => movePriceRow(sIdx, pIdx, -1)}
                          disabled={pIdx === 0}
                          title="Move up"
                        >&#9650;</button>
                        <button
                          style={{ ...xBtn, color: "#666", fontSize: "0.75rem" }}
                          onClick={() => movePriceRow(sIdx, pIdx, 1)}
                          disabled={pIdx === season.prices.length - 1}
                          title="Move down"
                        >&#9660;</button>
                        {season.prices.length > 1 && (
                          <button style={xBtn} onClick={() => removePriceRow(sIdx, pIdx)}>x</button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Per-person / half-double input row (shown when any row uses calculated mode) */}
                {season.prices.some((r) => r.pricing_mode !== "per_room") && (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.5rem 0.75rem",
                      background: "#fefce8",
                      border: "1px solid #fde68a",
                      borderRadius: 5,
                      fontSize: "0.8rem",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                    }}
                  >
                    {season.prices.map((row, pIdx) => {
                      if (row.pricing_mode === "per_room") return null;
                      return (
                        <div key={pIdx} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                          <span style={{ fontWeight: 600, color: "#92400e", minWidth: 80 }}>
                            {row.room_desc || "Row " + (pIdx + 1)} {row.meal_plan ? `(${row.meal_plan})` : ""}:
                          </span>
                          {row.pricing_mode === "per_person" && (
                            <>
                              <label style={{ color: "#666", fontSize: "0.75rem" }}>Pax</label>
                              <input style={{ ...num, width: 65, fontSize: "0.8rem" }} type="number" value={row.base_price ?? ""}
                                onChange={(e) => updatePriceRow(sIdx, pIdx, { base_price: e.target.value ? Number(e.target.value) : null })} />
                              <label style={{ color: "#666", fontSize: "0.75rem" }}>Sup</label>
                              <input style={{ ...num, width: 60, fontSize: "0.8rem" }} type="number" value={row.sgl_supplement ?? ""}
                                onChange={(e) => updatePriceRow(sIdx, pIdx, { sgl_supplement: e.target.value ? Number(e.target.value) : null })} />
                            </>
                          )}
                          {row.pricing_mode === "half_double" && (
                            <>
                              <label style={{ color: "#666", fontSize: "0.75rem" }}>&frac12;Dbl</label>
                              <input style={{ ...num, width: 65, fontSize: "0.8rem" }} type="number" value={row.base_price ?? ""}
                                onChange={(e) => updatePriceRow(sIdx, pIdx, { base_price: e.target.value ? Number(e.target.value) : null })} />
                              <label style={{ color: "#666", fontSize: "0.75rem" }}>Sup</label>
                              <input style={{ ...num, width: 60, fontSize: "0.8rem" }} type="number" value={row.sgl_supplement ?? ""}
                                onChange={(e) => updatePriceRow(sIdx, pIdx, { sgl_supplement: e.target.value ? Number(e.target.value) : null })} />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add price row */}
                <button
                  style={{ ...dashedBtn, marginTop: "0.5rem" }}
                  onClick={() => addPriceRow(sIdx)}
                >
                  + Add Price Row
                </button>
              </div>
            </div>
          ))}

          {/* Add Season */}
          <button
            onClick={() => setSeasons((prev) => [...prev, emptySeason()])}
            style={{
              background: "#e94560",
              color: "#fff",
              border: "none",
              padding: "0.5rem 1.2rem",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "0.9rem",
            }}
          >
            + Add Season
          </button>
        </div>
      )}

      {/* Save buttons */}
      <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", alignItems: "center" }}>
        {isEdit && (
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            style={{
              background: saving ? "#999" : "#059669",
              color: "#fff",
              border: "none",
              padding: "0.7rem 2rem",
              borderRadius: 6,
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          style={{
            background: saving ? "#999" : "#1a1a2e",
            color: "#fff",
            border: "none",
            padding: "0.7rem 2rem",
            borderRadius: 6,
            cursor: saving ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: "1rem",
          }}
        >
          {saving ? "Saving..." : isEdit ? "Save & Close" : "Save Hotel & Prices"}
        </button>
        {saved && (
          <span style={{ color: "#059669", fontWeight: 600, fontSize: "0.9rem" }}>Saved!</span>
        )}
      </div>

      {pushSnackbar && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "0.75rem 1.25rem",
            borderRadius: 8,
            background: pushSnackbar.ok ? "#059669" : "#dc2626",
            color: "#fff",
            fontSize: "0.8rem",
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            zIndex: 9999,
          }}
        >
          {pushSnackbar.msg}
        </div>
      )}
    </div>
  );
}
