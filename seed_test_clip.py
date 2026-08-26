import os
import uuid
from pathlib import Path

import boto3
import psycopg
from botocore.config import Config
from dotenv import load_dotenv

# .env ファイルから設定を読み込み
load_dotenv()

R2_ACCOUNT_ID = os.environ["R2_ACCOUNT_ID"]
R2_BUCKET = os.environ.get("R2_BUCKET", "dictation")
OWNER_ID = os.environ["OWNER_ID"]
DB_URL = os.environ["SUPABASE_DB_URL"]

OUT_DIR = Path("./out")

# Cloudflare R2 クライアントの初期化
s3 = boto3.client(
    "s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
    region_name="auto",
    config=Config(
        signature_version="s3v4",
        request_checksum_calculation="when_required",
        response_checksum_validation="when_required",
    ),
)


def upload(local: Path, key: str, content_type: str) -> int:
    size = local.stat().st_size
    s3.upload_file(
        str(local),
        R2_BUCKET,
        key,
        ExtraArgs={
            "ContentType": content_type,
            "CacheControl": "public, max-age=31536000, immutable",
        },
    )
    print(f"  uploaded: {key} ({size / 1e6:.2f} MB)")
    return size


def main() -> None:
    clip_id = str(uuid.uuid4())
    video_id = str(uuid.uuid4())

    video_key = f"clips/{clip_id}/v480.mp4"
    audio_key = f"clips/{clip_id}/a64.m4a"

    print("[1/2] Cloudflare R2 へアップロード中...")
    v_bytes = upload(OUT_DIR / "v480.mp4", video_key, "video/mp4")
    a_bytes = upload(OUT_DIR / "a64.m4a", audio_key, "audio/mp4")

    print("[2/2] Supabase データベースへ登録中...")
    with psycopg.connect(DB_URL) as conn, conn.cursor() as cur:
        # 1. videos テーブル登録
        cur.execute(
            """
            insert into videos
              (id, owner_id, youtube_id, title, channel, duration_ms, status)
            values (%s, %s, %s, %s, %s, %s, 'ready')
            """,
            (video_id, OWNER_ID, "PHASE0_TEST", "Phase 0 疎通テスト", "local", 45_000),
        )
        # 2. clips テーブル登録
        cur.execute(
            """
            insert into clips
              (id, owner_id, video_id, start_ms, end_ms, label, status, pinned)
            values (%s, %s, %s, 0, 45000, 'Phase 0 test clip', 'ready', true)
            """,
            (clip_id, OWNER_ID, video_id),
        )
        # 3. clip_assets テーブル登録
        cur.execute(
            """
            insert into clip_assets
              (clip_id, owner_id, r2_bucket, r2_video_key, r2_audio_key,
               video_bytes, audio_bytes, duration_ms, width, height, gop_frames)
            values (%s, %s, %s, %s, %s, %s, %s, 45000, 854, 480, 15)
            """,
            (clip_id, OWNER_ID, R2_BUCKET, video_key, audio_key, v_bytes, a_bytes),
        )
        conn.commit()

    print("\n==========================================")
    print("データ投入成功！")
    print(f"作成された Clip ID:\n{clip_id}")
    print("==========================================")


if __name__ == "__main__":
    main()