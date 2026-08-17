"""Start a portable PostgreSQL under %LOCALAPPDATA%/ai-career-pg (no admin)."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time

# Avoid non-ASCII paths: Windows username can break initdb under UTF8.
BASE = r"C:\ai-career-pg"
BIN = os.path.join(BASE, "pgsql", "bin")
DATA = os.path.join(BASE, "data")
LOG = os.path.join(BASE, "pg.log")
PWFILE = os.path.join(BASE, "pw.txt")
DB_NAME = "ai_career_assistant"


def run(args: list[str], env: dict[str, str], check: bool = True) -> subprocess.CompletedProcess[str]:
    print(">", " ".join(args), flush=True)
    result = subprocess.run(
        args,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.stdout.strip():
        print(result.stdout.encode("utf-8", errors="replace").decode("utf-8", errors="replace"))
    if result.stderr.strip():
        print(result.stderr.encode("utf-8", errors="replace").decode("utf-8", errors="replace"))
    if check and result.returncode != 0:
        raise SystemExit(f"command failed ({result.returncode}): {' '.join(args)}")
    return result


def port_open(host: str = "127.0.0.1", port: int = 5432) -> bool:
    sock = socket.socket()
    sock.settimeout(0.8)
    try:
        sock.connect((host, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def main() -> None:
    if not os.path.exists(os.path.join(BIN, "postgres.exe")):
        raise SystemExit(f"postgres binaries missing under {BIN}")

    env = os.environ.copy()
    env["PATH"] = BIN + os.pathsep + env.get("PATH", "")
    env["PGPASSWORD"] = "postgres"

    if not os.path.exists(os.path.join(DATA, "PG_VERSION")):
        with open(PWFILE, "w", encoding="utf-8") as fh:
            fh.write("postgres")
        run(
            [
                os.path.join(BIN, "initdb.exe"),
                "-D",
                DATA,
                "-U",
                "postgres",
                "-A",
                "password",
                "--pwfile",
                PWFILE,
                "-E",
                "UTF8",
                "--locale=C",
            ],
            env,
        )

    conf_path = os.path.join(DATA, "postgresql.conf")
    with open(conf_path, encoding="utf-8", errors="replace") as fh:
        conf = fh.read()
    conf = conf.replace("#listen_addresses = 'localhost'", "listen_addresses = 'localhost'")
    conf = conf.replace("#port = 5432", "port = 5432")
    with open(conf_path, "w", encoding="utf-8") as fh:
        fh.write(conf)

    if not port_open():
        # -w waits until ready then returns; avoid hanging forever on Windows shells.
        run(
            [
                os.path.join(BIN, "pg_ctl.exe"),
                "-D",
                DATA,
                "-l",
                LOG,
                "-o",
                "",
                "-w",
                "-t",
                "20",
                "start",
            ],
            env,
        )
        for _ in range(40):
            time.sleep(0.5)
            if port_open():
                break
        else:
            if os.path.exists(LOG):
                print(open(LOG, encoding="utf-8", errors="replace").read()[-3000:])
            raise SystemExit("postgres failed to start on 5432")

    print("Postgres is up on 5432", flush=True)

    check = run(
        [
            os.path.join(BIN, "psql.exe"),
            "-U",
            "postgres",
            "-h",
            "127.0.0.1",
            "-p",
            "5432",
            "-d",
            "postgres",
            "-tAc",
            f"SELECT 1 FROM pg_database WHERE datname='{DB_NAME}'",
        ],
        env,
        check=False,
    )
    if check.stdout.strip() != "1":
        run(
            [
                os.path.join(BIN, "createdb.exe"),
                "-U",
                "postgres",
                "-h",
                "127.0.0.1",
                "-p",
                "5432",
                DB_NAME,
            ],
            env,
        )

    print(f"Database {DB_NAME} ready", flush=True)


if __name__ == "__main__":
    main()
