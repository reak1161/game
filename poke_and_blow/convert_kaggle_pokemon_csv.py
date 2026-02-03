# convert_kaggle_pokemon_csv.py
import csv
from collections import Counter
from dataclasses import dataclass
from typing import List, Dict


# ==== ここだけ自分の CSV に合わせて書き換えてね ====================
# 例: Kaggle 側のカラム名 → 自分が使いたい論理名
COLUMN_MAP = {
    "dex_no": "Number",        # 全国図鑑番号っぽいカラム
    "name": "Name",            # ポケモン名
    "form": "Form",            # フォーム名（なければ空文字でもOK）
    "type1": "Type1",          # メインタイプ
    "type2": "Type2",          # サブタイプ（なければ空文字）
    "hp": "HP",
    "atk": "Attack",
    "def": "Defense",
    "spa": "Sp. Atk",
    "spd": "Sp. Def",
    "spe": "Speed",
    "bst": "Total",            # 合計種族値
    "generation": "Generation" # 世代
}
# ==================================================================


INPUT_CSV = "data/all_pokemon_with_stats.csv"
OUTPUT_CSV = "data/pokedex_for_game.csv"


@dataclass
class PokemonRow:
    dex_no: int
    name: str
    form: str
    type1: str
    type2: str
    hp: int
    atk: int
    deff: int
    spa: int
    spd: int
    spe: int
    bst: int
    generation: int
    form_count: int  # 同じ dex_no の行数


def load_raw_rows(path: str) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def convert_rows(raw_rows: List[Dict[str, str]]) -> List[PokemonRow]:
    # まず dex_no ごとの個数を数えて form_count にする
    dex_list: List[int] = []
    for r in raw_rows:
        dex = int(r[COLUMN_MAP["dex_no"]])
        dex_list.append(dex)
    form_counter = Counter(dex_list)

    converted: List[PokemonRow] = []
    for r in raw_rows:
        dex_no = int(r[COLUMN_MAP["dex_no"]])
        name = r[COLUMN_MAP["name"]].strip()

        # フォーム名がない/NaN なら空文字にする
        form = r.get(COLUMN_MAP["form"], "").strip() or "通常"

        type1 = r[COLUMN_MAP["type1"]].strip()
        type2 = (r.get(COLUMN_MAP["type2"], "") or "").strip()

        hp = int(r[COLUMN_MAP["hp"]])
        atk = int(r[COLUMN_MAP["atk"]])
        deff = int(r[COLUMN_MAP["def"]])
        spa = int(r[COLUMN_MAP["spa"]])
        spd = int(r[COLUMN_MAP["spd"]])
        spe = int(r[COLUMN_MAP["spe"]])

        # Total カラムがないならここで計算
        bst_str = r.get(COLUMN_MAP["bst"])
        if bst_str is not None and bst_str != "":
            bst = int(bst_str)
        else:
            bst = hp + atk + deff + spa + spd + spe

        gen_str = r.get(COLUMN_MAP["generation"], "")
        generation = int(gen_str) if gen_str else -1

        form_count = form_counter[dex_no]

        converted.append(
            PokemonRow(
                dex_no=dex_no,
                name=name,
                form=form,
                type1=type1,
                type2=type2,
                hp=hp,
                atk=atk,
                deff=deff,
                spa=spa,
                spd=spd,
                spe=spe,
                bst=bst,
                generation=generation,
                form_count=form_count,
            )
        )

    return converted


def save_for_game(rows: List[PokemonRow], path: str) -> None:
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
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for p in rows:
            writer.writerow({
                "dex_no": p.dex_no,
                "name": p.name,
                "form": p.form,
                "form_count": p.form_count,
                "generation": p.generation,
                "type1": p.type1,
                "type2": p.type2,
                "hp": p.hp,
                "atk": p.atk,
                "def": p.deff,
                "spa": p.spa,
                "spd": p.spd,
                "spe": p.spe,
                "bst": p.bst,
            })


def main():
    raw_rows = load_raw_rows(INPUT_CSV)
    print(f"raw rows: {len(raw_rows)}")

    converted = convert_rows(raw_rows)
    print(f"converted rows: {len(converted)}")

    save_for_game(converted, OUTPUT_CSV)
    print("書き出し完了:", OUTPUT_CSV)


if __name__ == "__main__":
    main()
