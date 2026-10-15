#!/usr/bin/env python3
"""
High-performance Anki .apkg extractor.
Handles zstandard decompression, unicase collation, protobuf media decoding,
and outputs complete collection metadata to JSON or extracts media files.
"""

import sys
import os
import json
import zipfile
import tempfile
import argparse

try:
    import zstandard
except ImportError:
    zstandard = None

def decode_varint(b, pos):
    res, shift = 0, 0
    while pos < len(b):
        byte = b[pos]
        pos += 1
        res |= (byte & 0x7f) << shift
        if (byte & 0x80) == 0:
            break
        shift += 7
    return res, pos

def decode_protobuf_media(b):
    media_map = {}
    pos = 0
    while pos < len(b):
        tag, pos = decode_varint(b, pos)
        fn, wt = tag >> 3, tag & 0x7
        if fn == 1 and wt == 2:
            entry_len, pos = decode_varint(b, pos)
            end_pos = pos + entry_len
            filename = ""
            entry_id = ""
            while pos < end_pos:
                inner_tag, pos = decode_varint(b, pos)
                ifn, iwt = inner_tag >> 3, inner_tag & 0x7
                if ifn == 1 and iwt == 2:
                    flen, pos = decode_varint(b, pos)
                    filename = b[pos:pos+flen].decode("utf-8", errors="replace")
                    pos += flen
                elif ifn == 2 and iwt == 0:
                    id_num, pos = decode_varint(b, pos)
                    entry_id = str(id_num)
                elif iwt == 2:
                    l, pos = decode_varint(b, pos)
                    pos += l
                elif iwt == 0:
                    _, pos = decode_varint(b, pos)
                else:
                    pos += 1
            if entry_id and filename:
                media_map[entry_id] = filename
        elif wt == 2:
            l, pos = decode_varint(b, pos)
            pos += l
        elif wt == 0:
            _, pos = decode_varint(b, pos)
        else:
            pos += 1
    return media_map

def decode_template_config(b):
    pos = 0
    qfmt, afmt = "", ""
    while pos < len(b):
        tag, pos = decode_varint(b, pos)
        fn, wt = tag >> 3, tag & 0x7
        if fn == 1 and wt == 2:
            l, pos = decode_varint(b, pos)
            qfmt = b[pos:pos+l].decode("utf-8", errors="replace")
            pos += l
        elif fn == 2 and wt == 2:
            l, pos = decode_varint(b, pos)
            afmt = b[pos:pos+l].decode("utf-8", errors="replace")
            pos += l
        elif wt == 2:
            l, pos = decode_varint(b, pos)
            pos += l
        elif wt == 0:
            _, pos = decode_varint(b, pos)
        else:
            pos += 1
    return qfmt, afmt

def extract_anki_metadata(apkg_path, output_json=None, extract_media_dir=None):
    with zipfile.ZipFile(apkg_path, 'r') as z:
        names = z.namelist()
        db_name = "collection.anki21b" if "collection.anki21b" in names else "collection.anki2"
        db_bytes = z.read(db_name)

        if db_bytes.startswith(b"(\xb5/\xfd"):
            if zstandard is None:
                raise RuntimeError("zstandard package is required to decompress modern Anki packages")
            dctx = zstandard.ZstdDecompressor()
            db_bytes = dctx.decompress(db_bytes, max_output_size=200*1024*1024)

        tmp_db = os.path.join(tempfile.gettempdir(), f"anki_{os.getpid()}.db")
        with open(tmp_db, "wb") as f:
            f.write(db_bytes)

        import sqlite3
        conn = sqlite3.connect(tmp_db)
        conn.create_collation("unicase", lambda a, b: (a.casefold() > b.casefold()) - (a.casefold() < b.casefold()))
        cursor = conn.cursor()

        # 1. Decks
        decks = {}
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='decks'")
        if cursor.fetchone():
            for row in cursor.execute("SELECT id, name FROM decks").fetchall():
                decks[str(row[0])] = row[1]
        else:
            cursor.execute("SELECT decks FROM col")
            d_json = json.loads(cursor.fetchone()[0])
            for k, v in d_json.items():
                decks[str(k)] = v["name"]

        # 2. Notetypes & Templates & Fields
        notetypes = {}
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notetypes'")
        if cursor.fetchone():
            # Modern schema
            cursor.execute("SELECT id, name FROM notetypes")
            for ntid, name in cursor.fetchall():
                notetypes[str(ntid)] = {
                    "name": name,
                    "fields": [],
                    "templates": {}
                }
            cursor.execute("SELECT ntid, ord, name FROM fields ORDER BY ntid, ord")
            for ntid, ord_val, fname in cursor.fetchall():
                sid = str(ntid)
                if sid in notetypes:
                    notetypes[sid]["fields"].append(fname)

            cursor.execute("SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord")
            for ntid, ord_val, tname, cfg in cursor.fetchall():
                sid = str(ntid)
                if sid in notetypes:
                    qfmt, afmt = decode_template_config(cfg)
                    notetypes[sid]["templates"][ord_val] = {
                        "name": tname,
                        "qfmt": qfmt,
                        "afmt": afmt
                    }
        else:
            # Legacy col.models
            cursor.execute("SELECT models FROM col")
            m_json = json.loads(cursor.fetchone()[0])
            for mid, m in m_json.items():
                notetypes[str(mid)] = {
                    "name": m["name"],
                    "fields": [f["name"] for f in m.get("flds", [])],
                    "templates": {
                        t["ord"]: {
                            "name": t["name"],
                            "qfmt": t["qfmt"],
                            "afmt": t["afmt"]
                        } for t in m.get("tmpls", [])
                    }
                }

        # 3. Notes
        notes = {}
        cursor.execute("SELECT id, mid, flds, tags FROM notes")
        for nid, mid, flds, tags in cursor.fetchall():
            field_values = flds.split("\x1f")
            nt = notetypes.get(str(mid), {"fields": []})
            field_names = nt.get("fields", [])
            f_map = {}
            for i, val in enumerate(field_values):
                fname = field_names[i] if i < len(field_names) else f"Field{i}"
                f_map[fname] = val
            notes[str(nid)] = {
                "mid": str(mid),
                "fields": f_map,
                "tags": [t for t in tags.strip().split() if t]
            }

        # 4. Cards
        cards = []
        cursor.execute("SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards")
        for cid, nid, did, ord_val, ctype, queue, due, ivl, factor, reps, lapses in cursor.fetchall():
            cards.append({
                "id": str(cid),
                "noteId": str(nid),
                "deckId": str(did),
                "ord": ord_val,
                "type": ctype,
                "queue": queue,
                "due": due,
                "interval": ivl,
                "factor": factor,
                "reps": reps,
                "lapses": lapses
            })

        # 5. Media dictionary
        media_map = {}
        if "media" in names:
            m_raw = z.read("media")
            if m_raw.startswith(b"(\xb5/\xfd"):
                if zstandard:
                    m_raw = zstandard.ZstdDecompressor().decompress(m_raw, max_output_size=100*1024*1024)
            if m_raw.strip().startswith(b"{"):
                media_map = json.loads(m_raw.decode("utf-8", errors="replace"))
            else:
                media_map = decode_protobuf_media(m_raw)

        # 6. Optional media extraction
        if extract_media_dir:
            os.makedirs(extract_media_dir, exist_ok=True)
            for entry_id, real_name in media_map.items():
                if entry_id in names:
                    out_path = os.path.join(extract_media_dir, real_name)
                    # Protect against directory traversal in filenames
                    out_path = os.path.abspath(out_path)
                    if out_path.startswith(os.path.abspath(extract_media_dir)):
                        with open(out_path, "wb") as mf:
                            mf.write(z.read(entry_id))

        conn.close()
        try:
            os.remove(tmp_db)
        except Exception:
            pass

        data = {
            "decks": decks,
            "notetypes": notetypes,
            "notes": notes,
            "cards": cards,
            "mediaMap": media_map
        }

        if output_json:
            with open(output_json, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)

        return data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract Anki .apkg collection")
    parser.add_argument("apkg", help="Path to .apkg file")
    parser.add_argument("--output", help="Path to output JSON file")
    parser.add_argument("--extract-media", help="Directory to extract media assets")
    args = parser.parse_args()

    extract_anki_metadata(args.apkg, args.output, args.extract_media)
