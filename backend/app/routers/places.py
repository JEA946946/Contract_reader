from fastapi import APIRouter, Query
import httpx

from app.config import settings

router = APIRouter(prefix="/api/places", tags=["places"])


@router.get("/autocomplete")
async def places_autocomplete(
    q: str = Query("", min_length=0),
    region: str = Query("", description="Region code, e.g. 'ma' for Morocco"),
):
    """Proxy for Google Places Autocomplete (New) API."""
    query = q.strip()
    if not query or len(query) < 2:
        return {"predictions": []}

    if not settings.google_places_api_key:
        return {"predictions": [], "error": "Google Places API key not configured"}

    url = "https://places.googleapis.com/v1/places:autocomplete"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.google_places_api_key,
    }
    body = {
        "input": query,
        "languageCode": "en",
    }
    if region.strip():
        body["includedRegionCodes"] = [region.strip()]

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=body, headers=headers, timeout=5)
            data = resp.json()

        predictions = []
        for s in data.get("suggestions", []):
            p = s.get("placePrediction")
            if p:
                predictions.append({
                    "place_id": p.get("placeId"),
                    "description": p.get("text", {}).get("text", ""),
                })
        return {"predictions": predictions}
    except Exception as exc:
        return {"predictions": [], "error": str(exc)}


@router.get("/details")
async def places_details(
    place_id: str = Query(..., description="Google Place ID"),
):
    """Proxy for Google Places Details (New) API."""
    if not settings.google_places_api_key:
        return {"error": "Google Places API key not configured"}

    url = f"https://places.googleapis.com/v1/places/{place_id}"
    headers = {
        "X-Goog-Api-Key": settings.google_places_api_key,
        "X-Goog-FieldMask": "displayName,formattedAddress,internationalPhoneNumber,nationalPhoneNumber,addressComponents,websiteUri",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers, timeout=5)
            data = resp.json()

        city = ""
        country = ""
        postal_code = ""
        state = ""
        for comp in data.get("addressComponents", []):
            types = comp.get("types", [])
            if "locality" in types:
                city = comp.get("longText", "")
            elif "country" in types:
                country = comp.get("longText", "")
            elif "postal_code" in types:
                postal_code = comp.get("longText", "")
            elif "administrative_area_level_1" in types:
                state = comp.get("longText", "")

        return {
            "name": data.get("displayName", {}).get("text", ""),
            "address": data.get("formattedAddress", ""),
            "phone": data.get("internationalPhoneNumber", "") or data.get("nationalPhoneNumber", ""),
            "website": data.get("websiteUri", ""),
            "city": city,
            "country": country,
            "postal_code": postal_code,
            "state": state,
        }
    except Exception as exc:
        return {"error": str(exc)}
