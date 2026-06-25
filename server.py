# Local development server and NAVER Maps API proxy for Questbook Daejeon.
from __future__ import annotations

import json
import mimetypes
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen


# The variable stores the repository root served as static files.
PROJECT_ROOT = Path(__file__).resolve().parent
# The variable stores the local dotenv file path.
DOTENV_PATH = PROJECT_ROOT / ".env"
# The variable stores NAVER Maps API host used by the official API reference.
NAVER_OPENAPI_BASE_URL = "https://naveropenapi.apigw.ntruss.com"
# The variable stores the Geocoding endpoint path.
GEOCODE_PATH = "/map-geocode/v2/geocode"
# The variable stores the Reverse Geocoding endpoint path.
REVERSE_GEOCODE_PATH = "/map-reversegeocode/v2/gc"
# The variable stores the network timeout for upstream NAVER requests.
UPSTREAM_TIMEOUT_SECONDS = 8
# The variable stores allowed reverse geocoding order tokens.
ALLOWED_REVERSE_ORDERS = {"legalcode", "admcode", "addr", "roadaddr"}
# The variable stores allowed geocoding languages.
ALLOWED_GEOCODE_LANGUAGES = {"kor", "eng"}
# The variable stores official documentation links returned to the frontend.
NAVER_MAP_DOCS = {
    "dynamicMap": "https://api.ncloud-docs.com/docs/application-maps-dynamic",
    "mapsJsSdk": "https://navermaps.github.io/maps.js.ncp/docs/",
    "geocoding": "https://api.ncloud-docs.com/docs/ai-naver-mapsgeocoding-geocode",
    "reverseGeocoding": "https://api.ncloud-docs.com/docs/ai-naver-mapsreversegeocoding-gc",
    "directions5": "https://api.ncloud-docs.com/docs/ai-naver-mapsdirections-driving",
}


def load_dotenv(path: Path) -> dict[str, str]:
    """
    Input: A pathlib Path pointing to a dotenv file.
    Output: A dictionary of environment keys and values.
    Role: Loads simple KEY=VALUE lines without exposing secret values.
    Example: env_values = load_dotenv(DOTENV_PATH)
    """
    # The variable stores parsed dotenv key-value pairs.
    values: dict[str, str] = {}
    if not path.exists():
        return values

    # The variable stores the raw dotenv file content.
    dotenv_text = path.read_text(encoding="utf-8")
    for raw_line in dotenv_text.splitlines():
        # The variable stores a trimmed dotenv line.
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        # The variable stores the raw key and value split.
        key, raw_value = line.split("=", 1)
        # The variable stores the normalized environment key.
        normalized_key = key.strip()
        # The variable stores the normalized environment value.
        normalized_value = raw_value.strip().strip("'").strip('"')
        values[normalized_key] = normalized_value
    return values


def get_env_value(name: str) -> str:
    """
    Input: An environment variable name.
    Output: The resolved environment variable value or an empty string.
    Role: Reads real environment first, then falls back to .env values.
    Example: api_key = get_env_value("NAVER_MAPS_API_KEY")
    """
    # The variable stores values parsed from the local dotenv file.
    dotenv_values = load_dotenv(DOTENV_PATH)
    return os.environ.get(name, dotenv_values.get(name, "")).strip()


def get_naver_credentials() -> tuple[str, str]:
    """
    Input: None.
    Output: A tuple of NAVER Maps API Key ID and API Key.
    Role: Centralizes credential lookup for REST API proxy routes.
    Example: key_id, key = get_naver_credentials()
    """
    # The variable stores the NAVER Maps API Key ID.
    api_key_id = get_env_value("NAVER_MAPS_API_KEY_ID")
    # The variable stores the NAVER Maps API Key secret.
    api_key = get_env_value("NAVER_MAPS_API_KEY")
    return api_key_id, api_key


def clamp_int(value: str | None, default: int, minimum: int, maximum: int) -> int:
    """
    Input: A raw integer string, default value, minimum, and maximum.
    Output: A bounded integer.
    Role: Keeps client-provided query values inside NAVER API limits.
    Example: count = clamp_int(params.get("count"), 5, 1, 100)
    """
    try:
        # The variable stores the parsed integer.
        parsed_value = int(value) if value is not None else default
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, parsed_value))


def first_query_value(query: dict[str, list[str]], name: str, default: str = "") -> str:
    """
    Input: A parsed query dictionary, field name, and default value.
    Output: The first query parameter value.
    Role: Normalizes parse_qs list values for route handlers.
    Example: query_text = first_query_value(query, "query")
    """
    # The variable stores every query value for the requested field.
    values = query.get(name, [])
    return values[0].strip() if values else default


def build_json_bytes(payload: dict[str, Any]) -> bytes:
    """
    Input: A JSON-serializable dictionary.
    Output: UTF-8 encoded JSON bytes.
    Role: Creates consistent JSON responses for API proxy routes.
    Example: body = build_json_bytes({"ok": True})
    """
    return json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")


def parse_required_float(raw_value: str, name: str, minimum: float, maximum: float) -> float:
    """
    Input: A raw numeric string, parameter name, minimum, and maximum.
    Output: A validated float.
    Role: Validates required latitude and longitude values.
    Example: latitude = parse_required_float("36.327", "lat", -90.0, 90.0)
    """
    if not raw_value:
        raise ValueError(f"{name} is required.")
    try:
        # The variable stores the parsed floating point value.
        parsed_value = float(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} must be a number.") from error
    if parsed_value < minimum or parsed_value > maximum:
        raise ValueError(f"{name} is outside the supported range.")
    return parsed_value


def normalize_coordinate_pair(raw_value: str) -> str:
    """
    Input: A raw longitude,latitude coordinate string.
    Output: A normalized coordinate string or an empty string.
    Role: Sanitizes optional Geocoding proximity coordinates before forwarding.
    Example: coordinate = normalize_coordinate_pair("127.427,36.327")
    """
    if not raw_value or "," not in raw_value:
        return ""

    # The variable stores the split coordinate tokens.
    parts = raw_value.split(",", 1)
    try:
        # The variable stores the longitude token.
        longitude = parse_required_float(parts[0].strip(), "coordinate longitude", -180.0, 180.0)
        # The variable stores the latitude token.
        latitude = parse_required_float(parts[1].strip(), "coordinate latitude", -90.0, 90.0)
    except ValueError:
        return ""
    return f"{longitude:.7f},{latitude:.7f}"


class QuestbookRequestHandler(SimpleHTTPRequestHandler):
    """
    Input: HTTP requests from the browser.
    Output: Static files or NAVER Maps proxy responses.
    Role: Serves the app and hides NAVER API credentials behind same-origin routes.
    Example: ThreadingHTTPServer(("127.0.0.1", 8000), QuestbookRequestHandler)
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        """
        Input: Handler constructor arguments from http.server.
        Output: None.
        Role: Pins the static serving directory to the repository root.
        Example: QuestbookRequestHandler(request, client_address, server)
        """
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def do_GET(self) -> None:
        """
        Input: The current GET request.
        Output: An HTTP response.
        Role: Routes NAVER proxy calls before falling back to static files.
        Example: GET /api/naver-map/config
        """
        # The variable stores parsed request URL components.
        parsed_url = urlparse(self.path)
        if parsed_url.path in {"/api/naver-map/config", "/api/naver-map/status"}:
            self.handle_config()
            return
        if parsed_url.path == "/api/naver-map/geocode":
            self.handle_geocode(parsed_url.query)
            return
        if parsed_url.path == "/api/naver-map/reverse-geocode":
            self.handle_reverse_geocode(parsed_url.query)
            return
        super().do_GET()

    def send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        """
        Input: An HTTPStatus and JSON-serializable payload.
        Output: A JSON HTTP response.
        Role: Writes API route responses in one place.
        Example: self.send_json(HTTPStatus.OK, {"configured": True})
        """
        # The variable stores encoded JSON response bytes.
        response_body = build_json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(response_body)

    def handle_config(self) -> None:
        """
        Input: None.
        Output: A JSON response describing NAVER Maps readiness.
        Role: Lets the frontend load Dynamic Map without exposing the REST API key.
        Example: GET /api/naver-map/config
        """
        # The variable stores the configured NAVER credentials.
        api_key_id, api_key = get_naver_credentials()
        # The variable stores whether Dynamic Map can load in the browser.
        dynamic_map_configured = bool(api_key_id)
        # The variable stores whether REST proxy routes can call NAVER APIs.
        rest_api_configured = bool(api_key_id and api_key)
        self.send_json(
            HTTPStatus.OK,
            {
                "dynamicMapConfigured": dynamic_map_configured,
                "restApiConfigured": rest_api_configured,
                "keyId": api_key_id if dynamic_map_configured else "",
                "requiredEnv": ["NAVER_MAPS_API_KEY_ID", "NAVER_MAPS_API_KEY"],
                "docs": NAVER_MAP_DOCS,
            },
        )

    def build_naver_headers(self, accept: str | None = None) -> dict[str, str]:
        """
        Input: An optional Accept header value.
        Output: Headers required by NAVER Maps REST APIs.
        Role: Adds API Key ID and API Key headers to upstream requests.
        Example: headers = self.build_naver_headers("application/json")
        """
        # The variable stores the configured NAVER credentials.
        api_key_id, api_key = get_naver_credentials()
        if not api_key_id or not api_key:
            raise RuntimeError("NAVER Maps REST API credentials are missing.")

        # The variable stores upstream request headers.
        headers = {
            "x-ncp-apigw-api-key-id": api_key_id,
            "x-ncp-apigw-api-key": api_key,
        }
        if accept:
            headers["Accept"] = accept
        return headers

    def request_upstream(self, path: str, params: dict[str, Any], accept: str | None = None) -> tuple[bytes, str, int]:
        """
        Input: A NAVER API path, query parameters, and optional Accept header.
        Output: Response bytes, content type, and upstream HTTP status code.
        Role: Performs a bounded same-host request to NAVER Open API.
        Example: body, content_type, status = self.request_upstream(GEOCODE_PATH, params, "application/json")
        """
        # The variable stores the encoded query string.
        query_string = urlencode(params, doseq=True)
        # The variable stores the complete NAVER upstream URL.
        upstream_url = f"{NAVER_OPENAPI_BASE_URL}{path}?{query_string}"
        # The variable stores the prepared upstream request.
        request = Request(upstream_url, headers=self.build_naver_headers(accept))

        try:
            with urlopen(request, timeout=UPSTREAM_TIMEOUT_SECONDS) as response:
                # The variable stores the upstream response content type.
                content_type = response.headers.get("Content-Type", "application/octet-stream")
                # The variable stores the upstream response status code.
                status_code = response.status
                # The variable stores the upstream response body.
                response_body = response.read()
                return response_body, content_type, status_code
        except HTTPError as error:
            # The variable stores the upstream error response body.
            error_body = error.read()
            # The variable stores the upstream error response content type.
            error_content_type = error.headers.get("Content-Type", "application/json; charset=utf-8")
            return error_body, error_content_type, error.code
        except URLError as error:
            raise RuntimeError(f"NAVER Maps upstream request failed: {error.reason}") from error

    def handle_geocode(self, raw_query: str) -> None:
        """
        Input: Raw query string containing an address query.
        Output: A JSON geocoding response from NAVER.
        Role: Converts a user-entered address into longitude and latitude candidates.
        Example: GET /api/naver-map/geocode?query=대전역
        """
        # The variable stores parsed client query parameters.
        query = parse_qs(raw_query)
        # The variable stores the address text to geocode.
        query_text = first_query_value(query, "query")
        if not query_text:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "query is required."})
            return

        # The variable stores optional proximity coordinate.
        coordinate = normalize_coordinate_pair(first_query_value(query, "coordinate"))
        # The variable stores requested response language.
        language = first_query_value(query, "language", "kor").lower()
        if language not in ALLOWED_GEOCODE_LANGUAGES:
            language = "kor"

        # The variable stores geocoding request parameters.
        upstream_params: dict[str, Any] = {
            "query": query_text,
            "language": language,
            "page": clamp_int(first_query_value(query, "page"), 1, 1, 1000),
            "count": clamp_int(first_query_value(query, "count"), 5, 1, 100),
        }
        if coordinate:
            upstream_params["coordinate"] = coordinate

        self.forward_json_response(GEOCODE_PATH, upstream_params)

    def handle_reverse_geocode(self, raw_query: str) -> None:
        """
        Input: Raw query string containing latitude and longitude.
        Output: A JSON reverse geocoding response from NAVER.
        Role: Converts a coordinate into readable legal, administrative, or road address data.
        Example: GET /api/naver-map/reverse-geocode?lat=36.327&lng=127.427
        """
        # The variable stores parsed client query parameters.
        query = parse_qs(raw_query)
        try:
            # The variable stores the latitude value to reverse geocode.
            latitude = parse_required_float(first_query_value(query, "lat"), "lat", -90.0, 90.0)
            # The variable stores the longitude value to reverse geocode.
            longitude = parse_required_float(first_query_value(query, "lng"), "lng", -180.0, 180.0)
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return

        # The variable stores the requested reverse geocoding orders.
        orders = first_query_value(query, "orders", "roadaddr,addr,admcode,legalcode")
        # The variable stores validated reverse geocoding order values.
        validated_orders = [order for order in orders.split(",") if order in ALLOWED_REVERSE_ORDERS]
        if not validated_orders:
            validated_orders = ["roadaddr", "addr", "admcode", "legalcode"]

        # The variable stores reverse geocoding request parameters.
        upstream_params = {
            "request": "coordsToaddr",
            "coords": f"{longitude:.7f},{latitude:.7f}",
            "sourcecrs": "epsg:4326",
            "orders": ",".join(validated_orders),
            "output": "json",
        }

        self.forward_json_response(REVERSE_GEOCODE_PATH, upstream_params)

    def forward_json_response(self, path: str, params: dict[str, Any]) -> None:
        """
        Input: A NAVER JSON API path and query parameters.
        Output: A JSON response from NAVER or an error payload.
        Role: Shares Geocoding and Reverse Geocoding response forwarding.
        Example: self.forward_json_response(GEOCODE_PATH, {"query": "대전역"})
        """
        try:
            # The variable stores the upstream JSON response.
            response_body, content_type, status_code = self.request_upstream(path, params, "application/json")
        except RuntimeError as error:
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(error)})
            return

        self.send_response(status_code)
        self.send_header("Content-Type", content_type or "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(response_body)

    def guess_type(self, path: str) -> str:
        """
        Input: A static file path.
        Output: A MIME type string.
        Role: Keeps JavaScript and JSON files served with usable MIME types.
        Example: content_type = self.guess_type("assets/js/map.js")
        """
        # The variable stores the MIME type guessed by the standard library.
        guessed_type = mimetypes.guess_type(path)[0]
        return guessed_type or super().guess_type(path)


def build_public_url(host: str, port: int) -> str:
    """
    Input: The bind host and port used by the local server.
    Output: A browser-facing URL for the app home page.
    Role: Prints a useful Tailscale or local URL when the server binds to all interfaces.
    Example: public_url = build_public_url("0.0.0.0", 8000)
    """
    # The variable stores an optional browser-facing URL from the environment.
    public_url = get_env_value("QUESTBOOK_PUBLIC_URL").rstrip("/")
    if public_url:
        return f"{public_url}/index.html"

    # The variable stores whether the server is listening on every IPv4 or IPv6 interface.
    listens_on_all_interfaces = host in {"0.0.0.0", "::"}
    # The variable stores a safe local fallback host for console output.
    display_host = "127.0.0.1" if listens_on_all_interfaces else host
    return f"http://{display_host}:{port}/index.html"


def run() -> None:
    """
    Input: None.
    Output: None.
    Role: Starts the local HTTP server for the static app and API proxy.
    Example: run()
    """
    # The variable stores the configured server host.
    host = get_env_value("QUESTBOOK_HOST") or "0.0.0.0"
    # The variable stores the configured server port.
    port = clamp_int(get_env_value("QUESTBOOK_PORT"), 8000, 1, 65535)
    # The variable stores the browser-facing app URL.
    public_url = build_public_url(host, port)
    # The variable stores the local server instance.
    server = ThreadingHTTPServer((host, port), QuestbookRequestHandler)
    print(f"Questbook Daejeon server listening on {host}:{port}")
    print(f"Open {public_url}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
