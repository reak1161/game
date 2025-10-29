# 追加するときに使う？多分違う
from data_list.items import addition

import pygame
import random

import fonts
import images
import colors
import buttons
import classes
import lattitle_main as lm

#addition.sushi.hi()

class Item:

    # 初期化
    def __init__(self, list):
        self.name = str(list[0])
        self.disp_name = str(list[1])
        self.amount = int(list[2])
        self.image = pygame.image.load("./data_list/items/images/" + self.name + ".png")

# アイテム一括型変換（初期化）
def init(item):
    
    for i in range(len(item)):
        item[i] = Item(item[i])


# アイテムメニューのページ関連を表示
def page_disp(side_page, side_page_max):
    # ページめくり用のボタン
    pygame.draw.rect(lm.screen, colors.SILVER, buttons.side_left_button)
    pygame.draw.rect(lm.screen, colors.SILVER, buttons.side_right_button)

    # ページ数の表示
    page_txt = str(side_page) + ' / ' + str(side_page_max)
    page_txt = fonts.side_button_font.render(page_txt, True, colors.BLACK)
    page_place = page_txt.get_rect(center=(1440*lm.resol[0]/1920, 984*lm.resol[1]/1080))
    lm.screen.blit(page_txt, page_place)


# アイテム選択
def choice(item, page, mouse):

    # 現在のページのみ
    for i in range(len(item)%20):
        
        # アイテムの画像の範囲変数
        item_left = (1056+(i%5)*(96+72))*lm.resol[0]/1920
        item_right = (1056+(i%5)*(96+72)+96)*lm.resol[0]/1920
        item_top = (264+int(i/5)*(96+72))*lm.resol[1]/1080
        item_bottom = (264+int(i/5)*(96+72)+96)*lm.resol[1]/1080
        
        # 選択中のアイテム
        if item_left <= mouse.x < item_right and item_top <= mouse.y < item_bottom:
            
            # 選択中のアイテムの枠を表示
            lm.screen.blit(pygame.transform.scale(images.img_item_frame, [128*lm.resol[0]/1920, 128*lm.resol[1]/1080]), [(1056+(i%5)*(96+72)-16)*lm.resol[0]/1920, (264+int(i/5)*(96+72)-16)*lm.resol[1]/1080])

            # カーソルが選んでいるアイテム番号を返す
            return i + (page - 1) * 20


# アイテム表示
def disp(item, page):

    # 現在のページのみ表示
    for i in range(len(item)%20):
        # アイテム画像表示
        lm.screen.blit(pygame.transform.scale(item[i+(page-1)*20].image, [96*lm.resol[0]/1920, 96*lm.resol[1]/1080]), [(1056+(i%5)*(96+72))*lm.resol[0]/1920, (264+int(i/5)*(96+72))*lm.resol[1]/1080])
        
        # 右下にアイテムの個数表示
        amount_txt = fonts.item_amount_font.render(str(item[i+(page-1)*20].amount), True, colors.BLACK)
        lm.screen.blit(amount_txt, amount_txt.get_rect(bottomright=((1056+96+(i%5)*(96+72))*lm.resol[0]/1920, (264+96+int(i/5)*(96+72))*lm.resol[1]/1080)))


# アイテム使用
def use(item, player, enemy, select_player, press_button, health_disp, mana_disp):

    if player[select_player].command[press_button].category == "item" and player[select_player].can_item == True:            

        # アイテムの個数が１個以上
        if item.amount > 0:
            
           # 使用したアイテム名の関数実行
            item_exe(player, enemy, select_player, item.name, health_disp, mana_disp)
            
        else: # ０個なら中断
            return

        # 数を１つ減らす
        item.amount -= 1

        # 行動ゲージリセット
        player[select_player].action = 0

# アイテム追加
def add(items, add_item):

    # リスト型だったらアイテム型に変更
    if type(add_item) == list:
        add_item = Item(add_item)

    # 持っていなければ最後尾に追加し、既に持っていれば数を加算する。
    for i in range(len(items)):
        if items[i].name == add_item.name:
            items[i].amount += add_item.amount
            return
    
    items.append(add_item)


# 最大HPを超えたら最大HPまで減らす
def over_HP_cut(player):

    if player.left_HP > player.HP:
        player.left_HP = player.HP

# 最大MPを超えたら最大MPまで減らす
def over_MP_cut(player):

    if player.Mgc.left_MP > player.Mgc.MP:
        player.Mgc.left_MP = player.Mgc.MP


# ポーション
# 使用者のHPを５０回復する
def potion(player, select_player, health_disp):

    # 回復量
    heal = [50]

    # 回復
    player[select_player].left_HP += heal[0]
    # 最大HPを超えた場合は減らす
    over_HP_cut(player[select_player])


    heal.append(1)
    # 横軸をプレイヤーの位置に
    heal.extend([(264+player[select_player].cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+player[select_player].cur_location[1]*(96+16))*lm.resol[1]/1080])
    health_disp.append(heal)


# マナポーション
# 使用者のMPを５０回復する
def mana_potion(player, select_player, mana_disp):
    
    # 回復量
    heal = [50]

    # 回復
    player[select_player].Mgc.left_MP += heal[0]
    # 最大MPを超えた場合は減らす
    over_MP_cut(player[select_player])


    heal.append(1)
    # 横軸をプレイヤーの位置に
    heal.extend([(264+player[select_player].cur_location[0]*(96+16)+random.randrange(96))*lm.resol[0]/1920, (552+player[select_player].cur_location[1]*(96+16))*lm.resol[1]/1080])
    mana_disp.append(heal)


# ハヤブサの羽
def falcon_feather(player, select_player):


    # すばやさを上げる
    player[select_player].effect.append(classes.Buff_Debuff(['buff', 'speed_up', 10, 0, 50]))
    player[select_player].effect[len(player[select_player].effect)-1].image = pygame.image.load("./data_list/images/effects/speed_up.png")



def item_exe(player, enemy, select_player, name, health_disp, mana_disp):

    if name == 'potion':

        potion(player, select_player, health_disp)

    elif name == 'mana_potion':

        mana_potion(player, select_player, mana_disp)

    elif name == 'falcon_feather':

        falcon_feather(player, select_player)