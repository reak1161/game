# merge_stats_and_jp.py
import csv
from collections import defaultdict

STATS_CSV = "PokemonDB.csv"       # 英語＋種族値のやつ
JP_CSV    = "poke_jp_utf8.csv"    # さっきUTF-8にした日本語名リスト
OUTPUT_CSV = "pokedex_for_game_jp.csv"


def dex_to_gen(dex: int) -> int:
    """全国図鑑番号から世代をざっくり推定"""
    if 1 <= dex <= 151:
        return 1
    if 152 <= dex <= 251:
        return 2
    if 252 <= dex <= 386:
        return 3
    if 387 <= dex <= 493:
        return 4
    if 494 <= dex <= 649:
        return 5
    if 650 <= dex <= 721:
        return 6
    if 722 <= dex <= 809:
        return 7
    if 810 <= dex <= 905:
        return 8
    if 906 <= dex <= 1008:
        return 9
    return -1


def main():
    # --- 1. stats側（英語＋種族値）を dex_no ごとにグループ ---
    stats_by_dex: dict[int, list[dict]] = defaultdict(list)
    with open(STATS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dex = int(row["#"])
            stats_by_dex[dex].append(row)

    # --- 2. 日本語名を dex_no ごとにグループ ---
    jp_by_dex: dict[int, list[str]] = defaultdict(list)
    with open(JP_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            dex = int(row["dex_no"])
            name_jp = row["name_jp"].strip()
            if name_jp:
                jp_by_dex[dex].append(name_jp)

    # --- 3. マージして書き出し ---
    fieldnames = [
        "dex_no",
        "name_en",
        "name_jp",   # ← ここに「～のすがた」入りの日本語名をそのまま入れる
        "form_en",   # Normal / Mega XXX / Galarian 等（英語のVariation）
        "form_count",
        "generation",
        "type1",
        "type2",
        "hp",
        "atk",
        "def",
        "spa",
        "spd",
        "spe",
        "bst",
    ]

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8-sig") as f_out:
        writer = csv.DictWriter(f_out, fieldnames=fieldnames)
        writer.writeheader()

        for dex_no, stat_rows in sorted(stats_by_dex.items()):
            jp_list = jp_by_dex.get(dex_no, [])

            form_count = len(stat_rows)
            for i, s in enumerate(stat_rows):
                name_en = s["Name"].strip()
                variation = (s.get("Variation") or "").strip()
                form_en = variation if variation else "Normal"

                # 日本語名は dex_no ごとの順番で対応付け
                # JP側が足りない場合は英語名でフォールバック
                name_jp = jp_list[i] if i < len(jp_list) else name_en

                # 「～のすがた」は name_jp 文字列を一切いじらないので、そのまま残る

                type1 = (s.get("Type1") or "").strip()
                type2 = (s.get("Type2") or "").strip()

                hp  = int(s["HP"])
                atk = int(s["Attack"])
                deff= int(s["Defense"])
                spa = int(s["Sp. Atk"])
                spd = int(s["Sp. Def"])
                spe = int(s["Speed"])
                bst = int(s["Total"])

                generation = dex_to_gen(dex_no)

                writer.writerow({
                    "dex_no": dex_no,
                    "name_en": name_en,
                    "name_jp": name_jp,
                    "form_en": form_en,
                    "form_count": form_count,
                    "generation": generation,
                    "type1": type1,
                    "type2": type2,
                    "hp": hp,
                    "atk": atk,
                    "def": deff,
                    "spa": spa,
                    "spd": spd,
                    "spe": spe,
                    "bst": bst,
                })

    print("書き出し完了:", OUTPUT_CSV)


if __name__ == "__main__":
    main()
