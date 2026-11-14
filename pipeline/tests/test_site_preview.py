"""Tests for make_site_preview: grid geometry, nodata handling, overlays, committed outputs.

Synthetic arrays only (no network); the committed-output test checks the images that the
web app ships against their recorded sha256 and the shared Jezero ground scale.
"""
import hashlib
import json

import numpy as np

import fetch_terrain as ft
import make_site_preview as msp


def test_grid_is_square_450_at_60m_and_keeps_nodata_missing():
    # 1" x 1" grid at 30 N covering the preview window: ~26.7 m E-W x 30.9 m N-S
    lat = 30.0
    py, px = ft.pixel_size_m(1 / 3600, 1 / 3600, lat)
    rows, cols = round(msp.PREVIEW_KM * 1000 / py), round(msp.PREVIEW_KM * 1000 / px)
    arr = np.add.outer(np.arange(rows, dtype=float), np.zeros(cols))   # rises to the south
    arr[:40, :40] = ft.NODATA_FILL
    z, info = msp.site_grid(arr, 1 / 3600, 1 / 3600, lat)
    assert z.shape == (msp.SIZE_PX, msp.SIZE_PX) == (450, 450)
    assert info["blockFactors"] == [2, 2]
    assert np.isnan(z[0, 0])                       # missing stays missing (never filled with 0)
    assert np.nanmean(z[-10:]) > np.nanmean(z[10:20])   # orientation: south is the bottom


def test_overlays_match_jezero_scale():
    ov = msp.overlays()
    left, top, right, bottom = ov["square"]
    assert ov["marker"] == (225.0, 225.0)
    assert abs((right - left) * msp.MPP - 10_000) < 1e-6
    assert abs(ov["bar_px"] * msp.MPP - 10_000) < 1e-6


def test_committed_previews_match_metadata():
    meta = json.loads(msp.META_JSON.read_text(encoding="utf-8"))
    targets = json.loads((msp.WEB_DIR / "src" / "data" / "terrainPreviews.json").read_text(encoding="utf-8"))
    assert meta, "no site previews committed"
    for sid, e in meta.items():
        data = (msp.WEB_DIR / "public" / e["image"]).read_bytes()
        assert hashlib.sha256(data).hexdigest() == e["sha256"], sid
        assert e["metresPerPixel"] == targets["mars-jezero"]["metresPerPixel"]
        assert abs(e["windowKm"] - targets["mars-jezero"]["windowKm"]) < 0.01
        assert e["hillshade"]["vertExag"] == 1.0
        assert e["source"]["sameAsScored"] is True
