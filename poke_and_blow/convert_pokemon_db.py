# convert_pokemon_db.py
import csv
from collections import Counter

INPUT_CSV = "PokemonDB.csv"
OUTPUT_CSV = "pokedex_for_game.csv"


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
    return -1  # 不明


def main():
    # ---- 1周目: 全行読み込んで dex_no ごとのフォーム数を数える ----
    rows = []
    with open(INPUT_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    # "#" カラムを整数に
    dex_list = [int(r["#"]) for r in rows]
    form_counter = Counter(dex_list)

    # ---- 2周目: ゲーム用フォーマットに変換して書き出し ----
    fieldnames = [
        "dex_no",
        "name",
        "form",
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

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8",) as f_out:
        writer = csv.DictWriter(f_out, fieldnames=fieldnames)
        writer.writeheader()

        for r in rows:
            dex_no = int(r["#"])
            name = r["Name"].strip()

            # Variation が空なら "Normal" 扱い
            variation = (r.get("Variation") or "").strip()
            form = variation if variation else "Normal"

            type1 = (r.get("Type1") or "").strip()
            type2 = (r.get("Type2") or "").strip()

            hp = int(r["HP"])
            atk = int(r["Attack"])
            deff = int(r["Defense"])
            spa = int(r["Sp. Atk"])
            spd = int(r["Sp. Def"])
            spe = int(r["Speed"])
            bst = int(r["Total"])

            generation = dex_to_gen(dex_no)
            form_count = form_counter[dex_no]

            writer.writerow({
                "dex_no": dex_no,
                "name": name,
                "form": form,
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

    print("変換完了:", OUTPUT_CSV)


if __name__ == "__main__":
    main()
