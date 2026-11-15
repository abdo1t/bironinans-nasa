"""Download EMIT L2B surface-mineral granules (EMITL2BMIN v002) for each site in Raw Data/sites.csv.

EMIT files sit behind a NASA Earthdata login, so this script needs YOUR token:
  1. Sign in at https://urs.earthdata.nasa.gov  ->  "Generate Token"
  2. PowerShell:  $env:EARTHDATA_TOKEN = "<paste token>"
  3. python -I data-tools/download_emit.py

Picks the least-cloudy v002 granule per site (two files, about 40-75 MB each: mineral map + uncertainty).
Close Excel or any program that has Raw Data/manifest.csv open first; Windows locks open CSV files.
Sites with no EMIT coverage (polar / high latitude) are logged and skipped.
"""
import csv, datetime as dt, hashlib, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Raw Data")
UA = "analog-portfolio-planner-downloader/1.0"
CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"


CHAIN = []  # hosts visited by the last request, for error reports (never includes query strings)


class DropAuthOffNasa(urllib.request.HTTPRedirectHandler):
    """LP DAAC redirects to pre-signed S3/CloudFront URLs. urllib would forward the bearer token
    there, which leaks it, so strip it unless the target is a nasa.gov host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        host = urllib.parse.urlparse(newurl).hostname or ""
        CHAIN.append(f"{code}->{host}")
        new = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new is not None and not host.endswith(".nasa.gov"):
            new.remove_header("Authorization")
        return new


# The cookie jar matters: URS sends the browser back to LP DAAC with a one-time code, and LP DAAC
# answers with a session cookie before redirecting to the file. Without cookies that loop can 500.
OPENER = urllib.request.build_opener(DropAuthOffNasa, urllib.request.HTTPCookieProcessor())


def describe(e):
    """Short, token-free description of a failed request, including the server's own message."""
    msg = str(e)
    if isinstance(e, urllib.error.HTTPError):
        try:
            body = e.read(300).decode("utf8", "replace").replace("\n", " ")
        except Exception:
            body = ""
        msg += f" | server said: {body} | redirects: {' '.join(CHAIN) or 'none'}"
    return msg.replace(os.environ.get("EARTHDATA_TOKEN", "\0"), "<token>")


def get(url, token=None, timeout=600):
    headers = {"User-Agent": UA}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return OPENER.open(urllib.request.Request(url, headers=headers), timeout=timeout)


def log(msg):
    line = f"{dt.datetime.now(dt.timezone.utc):%Y-%m-%dT%H:%M:%SZ} [emit] {msg}"
    print(line, flush=True)
    with open(os.path.join(ROOT, "download_log.txt"), "a", encoding="utf-8") as f:
        f.write(line + "\n")


def main():
    token = os.environ.get("EARTHDATA_TOKEN", "").strip().strip("\"'").strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token:
        sys.exit(__doc__)
    # A real Earthdata token is a JWT: three dot-separated parts, starting "eyJ", several hundred characters.
    # A value of any other shape makes NASA's login page crash with an HTTP 500, so catch it here.
    if not token.startswith("eyJ") or token.count(".") != 2 or len(token) < 200:
        sys.exit(f"EARTHDATA_TOKEN does not look like an Earthdata token (length {len(token)}, "
                 f"{token.count('.')} dots, starts with 'eyJ': {token.startswith('eyJ')}). "
                 "On urs.earthdata.nasa.gov open 'Generate Token', click 'Generate Token', and copy the long "
                 "string shown under 'Token'. Do not copy the 'Bearer ' prefix, a password or a username.")
    try:  # fail now, not after the downloads, if something (usually Excel) has the manifest open
        open(os.path.join(ROOT, "manifest.csv"), "a").close()
    except PermissionError:
        sys.exit("Raw Data/manifest.csv is locked. Close Excel (or any program that has it open) and run again.")
    with open(os.path.join(ROOT, "sites.csv"), newline="", encoding="utf-8") as f:
        sites = list(csv.DictReader(f))
    rows, failed = [], 0
    for s in sites:
        q = urllib.parse.urlencode({"short_name": "EMITL2BMIN", "version": "002",
                                    "point": f"{s['lon']},{s['lat']}", "page_size": 200})
        with get(f"{CMR}?{q}", timeout=60) as r:
            entries = json.load(r)["feed"]["entry"]
        if not entries:
            log(f"no EMIT coverage for {s['site_id']} (unknown verdict for mineralogy)")
            continue
        best = min(entries, key=lambda e: float(e.get("cloud_cover") or 100))
        # CMR also lists s3:// copies of each file; those are for in-AWS access only, so keep https links.
        links = [l["href"] for l in best["links"]
                 if l["href"].startswith("https://") and l["href"].endswith(".nc") and "/lp-prod-protected/" in l["href"]]
        for url in links:
            rel = f"Earth/EMIT_L2B_Minerals/{s['site_id']}/{url.rsplit('/', 1)[1]}"
            dest = os.path.join(ROOT, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            if os.path.exists(dest):
                log(f"skip (present) {rel}")
            else:
                for attempt in range(3):
                    CHAIN.clear()
                    try:
                        with get(url, token) as r, open(dest + ".part", "wb") as out:
                            while chunk := r.read(1 << 20):
                                out.write(chunk)
                        os.replace(dest + ".part", dest)
                        log(f"ok {rel} ({os.path.getsize(dest):,} bytes, cloud {best.get('cloud_cover')}%)")
                        break
                    except Exception as e:
                        log(f"retry {attempt + 1} {rel}: {describe(e)}")
                        if isinstance(e, urllib.error.HTTPError) and e.code in (401, 403):
                            sys.exit("Token rejected (401/403). Generate a new token at urs.earthdata.nasa.gov and make sure "
                                     "'LP DAAC Data Pool' is approved under Applications > Authorized Apps.")
                        time.sleep(5)
                else:
                    failed += 1
                    if failed >= 2 and not rows:
                        sys.exit("Two files in a row failed and none succeeded, so stopping. "
                                 "Send the 'server said' lines above so the cause can be found.")
                    continue
            h = hashlib.sha256(open(dest, "rb").read()).hexdigest()
            rows.append({"path": rel, "source": "EMIT L2B MIN v002 (NASA LP DAAC)", "url": url,
                         "bytes": os.path.getsize(dest), "sha256": h,
                         "downloaded_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
    path = os.path.join(ROOT, "manifest.csv")
    old = {}
    if os.path.exists(path):
        with open(path, newline="", encoding="utf-8") as f:
            old = {r["path"]: r for r in csv.DictReader(f)}
    for r in rows:
        old[r["path"]] = r
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["path", "source", "url", "bytes", "sha256", "downloaded_utc"])
        w.writeheader()
        for k in sorted(old):
            w.writerow(old[k])
    log(f"done: {len(rows)} EMIT files recorded")


if __name__ == "__main__":
    main()
