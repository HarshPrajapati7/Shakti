"""Download every dataset ASTRA-HEALTH needs into data/raw/downloads (resumable, ~2.6 GB in total).

  python scripts/download_data.py            # all
  python scripts/download_data.py prcp       # one of: prcp ppg wesad

PRCP comes from PhysioNet (56 MB zip). For PPG-DaLiA and WESAD, only the per-subject S*.pkl members are fetched
from the authors' servers with HTTP range requests (see fetch_zip_members.py), so the multi-GB archives are never
downloaded in full. Licences: PRCP ODC-By, PPG-DaLiA CC BY 4.0, WESAD non-commercial research use with attribution.
"""
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DL = ROOT / "data" / "raw" / "downloads"
SRC = {
    "prcp": ("https://physionet-open.s3.amazonaws.com/prcp/prcp-1.0.0.zip", "prcp-1.0.0.zip", None),
    "ppg": ("https://uni-siegen.sciebo.de/public.php/dav/files/pfHzlTepXkiJ4jP", "PPG_DaLiA.zip", r"S\d+\.pkl$"),
    "wesad": ("https://uni-siegen.sciebo.de/public.php/dav/files/HGdUkoNlW1Ub0Gx", "WESAD.zip", r"S\d+\.pkl$"),
}


def main(names):
    DL.mkdir(parents=True, exist_ok=True)
    for n in names:
        url, fname, pattern = SRC[n]
        dst = DL / fname
        print(f"== {n} -> {dst}")
        if pattern is None:
            if dst.exists() and dst.stat().st_size > 50e6:
                print("   already downloaded"); continue
            urllib.request.urlretrieve(url, dst, lambda b, bs, t: print(f"\r   {b * bs / 1e6:6.1f} / {t / 1e6:.1f} MB", end=""))
            print()
        else:
            r = subprocess.run([sys.executable, str(ROOT / "scripts" / "fetch_zip_members.py"), url, str(dst), "--pattern", pattern, "--threads", "8"])
            if r.returncode:
                raise SystemExit(f"{n}: download failed - rerun the same command to resume")
    print("all datasets ready")


if __name__ == "__main__":
    main(sys.argv[1:] or list(SRC))
