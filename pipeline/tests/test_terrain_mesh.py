import math

import numpy as np

import make_terrain_mesh as mtm


def test_coarsen_block_mean_ignores_nan_and_drops_ragged_edge():
    z = np.arange(7 * 7, dtype=float).reshape(7, 7)
    z[0, 0] = np.nan
    c = mtm.coarsen(z, factor=3)
    assert c.shape == (2, 2)
    block = z[0:3, 0:3]
    assert math.isclose(c[0, 0], np.nanmean(block))
    assert math.isclose(c[1, 1], z[3:6, 3:6].mean())


def test_coarsen_mostly_missing_block_is_nan():
    z = np.full((3, 3), np.nan)
    z[0, 0] = 5.0
    assert np.isnan(mtm.coarsen(z, factor=3)[0, 0])


def test_encode_int16_roundtrip_and_nodata():
    zc = np.array([[-2709.6, 1956.4], [np.nan, 0.4]])
    data, info = mtm.encode(zc)
    back = np.frombuffer(data, dtype="<i2").reshape(2, 2)
    assert back.tolist() == [[-2710, 1956], [mtm.NODATA, 0]]
    assert info["nodataCells"] == 1
    assert math.isclose(info["minM"], -2709.6) and math.isclose(info["maxM"], 1956.4)
