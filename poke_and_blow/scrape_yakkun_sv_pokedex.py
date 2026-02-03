# scrape_yakkun_sv_pokedex.py
import csv
import time
from dataclasses import dataclass
from typing import List, Dict
import requests
from bs4 import BeautifulSoup


BASE_LIST_URL = "https://yakkun.com/sv/stats_list.htm?mode=all"
BASE_ZUKAN_URL = "https://yakkun.com/sv/zukan/"  # n1, n2, ... などがぶら下がる


@dataclass
class StatsRow:
    dex_no: int           # 全国No.
    name: str             # 表示名（メガ○○, ～のすがた含む）
    detail_url: str       # 図鑑へのリンク
    hp: int
    atk: int
    deff: int
    spa: int
    spd: int
    spe: int
    bst: int


@dataclass
class PokemonRecord:
    dex_no: int
    name: str
    form_name: str        # "通常", "メガフシギバナ", "アローラのすがた" など
    form_count: int       # 同じdex_noの行総数
    generation: int       # 1〜9
    type1: str
    type2: str
    hp: int
    atk: int
    deff: int
    spa: int
    spd: int
    spe: int
    bst: int


def fetch_html(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; LocalPokeTool/0.1)"
    }
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    return resp.text


def parse_stats_list() -> List[StatsRow]:
    """種族値リストページから全行を取得"""

    html = fetch_html(BASE_LIST_URL)
    soup = BeautifulSoup(html, "html.parser")

    # ページ内には「No. ポケモン HP 攻撃 防御 特攻 特防 素早 合計」のテーブルが1つある想定 :contentReference[oaicite:4]{index=4}
    table = soup.find("table")
    if not table:
        raise RuntimeError("種族値テーブルが見つかりませんでした")

    rows: List[StatsRow] = []

    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 8:
            continue  # ヘッダ行など

        # No.
        dex_no_text = tds[0].get_text(strip=True)
        if not dex_no_text.isdigit():
            continue
        dex_no = int(dex_no_text)

        # 名前 + 図鑑リンク
        name_link = tds[1].find("a")
        if not name_link:
            continue
        name = name_link.get_text(strip=True)
        detail_href = name_link.get("href")
        if detail_href.startswith("/"):
            detail_url = "https://yakkun.com" + detail_href
        else:
            detail_url = detail_href

        # 種族値（HP 攻撃 防御 特攻 特防 素早 合計） :contentReference[oaicite:5]{index=5}
        hp   = int(tds[2].get_text(strip=True))
        atk  = int(tds[3].get_text(strip=True))
        deff = int(tds[4].get_text(strip=True))
        spa  = int(tds[5].get_text(strip=True))
        spd  = int(tds[6].get_text(strip=True))
        spe  = int(tds[7].get_text(strip=True))
        bst  = int(tds[8].get_text(strip=True))

        rows.append(
            StatsRow(
                dex_no=dex_no,
                name=name,
                detail_url=detail_url,
                hp=hp,
                atk=atk,
                deff=deff,
                spa=spa,
                spd=spd,
                spe=spe,
                bst=bst,
            )
        )

    return rows


def parse_types_and_generation(detail_url: str) -> (List[str], int):
    """
    図鑑ページから
      - タイプ（最大2つ）
      - 初登場世代
    を取得する。

    例: フシギダネのページでは
      タイプ: ページ中の「タイプ」欄に くさ / どく が並ぶ :contentReference[oaicite:6]{index=6}
      初登場: 「初登場 第1世代 / 赤緑青ピカチュウ」のように書いてある :contentReference[oaicite:7]{index=7}
    """

    html = fetch_html(detail_url)
    soup = BeautifulSoup(html, "html.parser")

    # --- タイプ ---
    type_names: List[str] = []
    # 「タイプ」の見出しを探し、その直後のリストを拾う方法（ややゴリ押し気味）
    type_header = None
    for h in soup.find_all(["h2", "h3", "dt", "strong"]):
        if "タイプ" in h.get_text():
            type_header = h
            break

    if type_header:
        # header の次の要素付近にタイプアイコンが並んでいる
        # (yakkun はタイプアイコンが <img alt="くさ"> みたいな構造になっていることが多い)
        for img in type_header.find_all_next("img", limit=10):
            alt = img.get("alt", "").strip()
            # タイプ名ぽいものだけ採用
            if alt and len(alt) <= 5:  # "くさ", "どく", "フェアリー" など
                type_names.append(alt)
        # ダブり削除
        type_names = list(dict.fromkeys(type_names))

    # 安全側で長すぎる or 取りすぎたと感じたら2つまでに絞る
    if len(type_names) > 2:
        type_names = type_names[:2]

    # --- 初登場世代 ---
    generation = 0
    gen_text = None
    for t in soup.find_all(text=True):
        s = str(t)
        if "初登場" in s and "第" in s and "世代" in s:
            gen_text = s
            break

    # 例: "初登場第1世代 / 赤緑青ピカチュウ" から "1" を抜く :contentReference[oaicite:8]{index=8}
    if gen_text:
        import re
        m = re.search(r"第(\d)世代", gen_text)
        if m:
            generation = int(m.group(1))

    # フォールバック
    if not type_names:
        type_names = ["不明"]
    if generation == 0:
        generation = -1  # 不明扱い

    # 要素数調整
    if len(type_names) == 1:
        type_names.append("")  # type2 を空欄にするため

    return type_names, generation


def split_name_and_form(full_name: str) -> (str, str):
    """
    "ピカチュウ (相棒)" -> base="ピカチュウ", form="相棒"
    "ナッシー (アローラのすがた)" -> base="ナッシー", form="アローラのすがた"
    "メガフシギバナ" -> base="フシギバナ", form="メガフシギバナ" など
    適当に好みで調整してOK。
    """
    import re

    # () で括られているものをフォーム名にする
    m = re.match(r"(.+?)\s*[\(（](.+?)[\)）]", full_name)
    if m:
        base = m.group(1)
        form = m.group(2)
        return base, form

    # 「メガ」「ヒスイのすがた」などを特別扱いしたければここで条件分岐
    if full_name.startswith("メガ"):
        base = full_name.replace("メガ", "")
        return base, full_name

    # それ以外はフォーム名なし扱い
    return full_name, "通常"


def main():
    print("== 種族値リストを取得中 ==")
    stats_rows = parse_stats_list()
    print(f"行数: {len(stats_rows)}")

    # 姿違いの個数を No. ごとに数える
    form_count_by_dex: Dict[int, int] = {}
    for row in stats_rows:
        form_count_by_dex[row.dex_no] = form_count_by_dex.get(row.dex_no, 0) + 1

    # 図鑑ページは全国No.ごとに1回にしたい
    # （メガなどフォーム違いは同じNo.を共有していることが多い）
    zukan_url_by_dex: Dict[int, str] = {}
    for row in stats_rows:
        if row.dex_no not in zukan_url_by_dex:
            zukan_url_by_dex[row.dex_no] = row.detail_url

    type_gen_by_dex: Dict[int, tuple] = {}

    print("== 図鑑ページからタイプ・世代を取得中 ==")
    for dex_no, url in sorted(zukan_url_by_dex.items()):
        print(f"No.{dex_no}: {url}")
        try:
            types, gen = parse_types_and_generation(url)
        except Exception as e:
            print("  エラー:", e)
            types, gen = (["不明", ""], -1)
        type_gen_by_dex[dex_no] = (types, gen)
        time.sleep(1.0)  # 負荷軽減

    # 最終レコード生成
    records: List[PokemonRecord] = []

    for row in stats_rows:
        base_name, form_name = split_name_and_form(row.name)
        form_count = form_count_by_dex.get(row.dex_no, 1)
        types, gen = type_gen_by_dex.get(row.dex_no, (["不明", ""], -1))

        rec = PokemonRecord(
            dex_no=row.dex_no,
            name=base_name,
            form_name=form_name,
            form_count=form_count,
            generation=gen,
            type1=types[0],
            type2=types[1],
            hp=row.hp,
            atk=row.atk,
            deff=row.deff,
            spa=row.spa,
            spd=row.spd,
            spe=row.spe,
            bst=row.bst,
        )
        records.append(rec)

    # CSV出力
    out_path = "pokedex_sv_yakkun.csv"
    fieldnames = [
        "dex_no",
        "name",
        "form_name",
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
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in records:
            writer.writerow({
                "dex_no": r.dex_no,
                "name": r.name,
                "form_name": r.form_name,
                "form_count": r.form_count,
                "generation": r.generation,
                "type1": r.type1,
                "type2": r.type2,
                "hp": r.hp,
                "atk": r.atk,
                "def": r.deff,
                "spa": r.spa,
                "spd": r.spd,
                "spe": r.spe,
                "bst": r.bst,
            })

    print("書き出し完了:", out_path)


if __name__ == "__main__":
    main()
