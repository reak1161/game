import pygame
from pygame.locals import *
import sys
import glob
import math
#import copy
import random
#from importlib import import_module

import classes
import move
import action
import command

import attack
import defense
import magic

import colors
import fonts
import images
import buttons
import field

import effects

import players
import enemies

import items

import main_menu
import side_menu

print('!')

# １秒当たりのフレーム数
fps = 90

# 解像度
resol = [1440, 810]

screen = pygame.display.set_mode(resol)

# 表示中の画面
current_display = "main_menu"

# プレイ画面の右側
side_display = "players"


def main():
    pygame.init()
    pygame.display.set_caption("ラティトル")
    
    global screen
    global current_display
    global side_display

    clock = pygame.time.Clock()
    
    # フォント初期化
    fonts.init()

    # 画像初期化
    images.init()

    tmr = 0
    m_line = []

    # ゲーム終了後の余韻
    afterglow = -1

    # カーソル位置
    cursor = classes.Cursor()

    # マウスカーソル
    mouse = classes.Mouse(pygame.mouse.get_pos())

    # 盤面の状態　cursorとはx,yが逆　（位置は同じだけどインデックスが逆）
    # （追加効果をつける）
    field_status = [[0, 0, 0, 0],
                    [0, 0, 0, 0],
                    [0, 0, 0, 0],
                    [0, 0, 0, 0]]
    
    # 盤面の各マスの座標　cursorとx,yが逆　（位置は同じだけどインデックスが逆）
    field_location = [[[[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]]],
                      [[[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]]],
                      [[[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]]],
                      [[[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]], [[0, 0], [0, 0], [0, 0]]]]
    
    # 盤面初期化    
    field.init(field_location, field_status)
    
    
    # データを格納
    player_data = []
    enemy_data = []

    # 選択中のプレイヤー
    select_player = -1

    # 選択中のアイテム
    choice_item = -1
    
    # 決定中のアイテム
    picked_item = -1
    
    # ファイルからデータ読みこみ
    players.read_file(player_data)
    enemies.read_file(enemy_data)

    # 今回のプレイヤー
    current_player = ['まお', 'しょう', 'ぽんきち', 'まさよし']

    # プレイヤー情報
    player = []

    # 今回のプレイヤーを追加
    players.player_choice(player, player_data, current_player, field_status)  

    # プレイヤーカラー初期化
    colors.init(player)

    # 今回の敵
    #current_enemy = ["ひょう", "えん"]
    current_enemy = ["へび"]

    # 今回の敵の情報
    enemy = []
    

    # HPの増減を表示
    health_disp = []

    # MPの増減を表示
    mana_disp = []

    # 押しているボタン
    press_button = -1

    # ボタン初期化
    buttons.init()
    

    # アイテム
    item = []

    # デフォルトのアイテム
    default_items = [['potion', 'ポーション', 5],
                     ['mana_potion', 'マナポーション', 3]]

    # アイテムリストに追加
    item.extend(default_items)

    # アイテムの型変更（初期化）
    items.init(item)

    # アイテム追加（チュートリアル用）
    items.add(item, ['falcon_feather', 'ハヤブサの羽', 2])

    # ページ数　現在のページと最大値
    side_page = 1
    # アイテム２０個ごとにページを区切る
    side_page_max = math.ceil(len(item)/20)

    # （アイテム２０個以上のデバッグはしてない）

    while True:
        tmr = tmr + 1  

        # 外枠
        screen.fill(colors.BLACK)
        pygame.draw.rect(screen, colors.WHITE, [[0, 0], resol])

        # マウスカーソル
        mouse.update(pygame.mouse.get_pos())

        # マウスクリック
        m_btnl, m_btnm, m_btnr = pygame.mouse.get_pressed()


        # メインメニュー
        if current_display == "main_menu":

            # メインメニューを表示
            main_menu.disp_main_menu()

        # 設定画面
        if current_display == "title_option":

            option_txt = fonts.option_font.render("設定", True, colors.BLACK)
            option_place = option_txt.get_rect(center=(960*resol[0]/1920, 330*resol[1]/1080))
            screen.blit(option_txt, option_place)

        # 結果
        if current_display == "result":

            if game_clear == True:
                result_txt = fonts.result_font.render("ゲームクリア", True, colors.BLACK)

            if game_over == True:
                result_txt = fonts.result_font.render("ゲームオーバー", True, colors.BLACK)

            result_place = result_txt.get_rect(center=(960*resol[0]/1920, 330*resol[1]/1080))
            screen.blit(result_txt, result_place)


        if current_display == "game_play":

            # サイドメニューを表示
            side_menu.disp_side_menu()

            # サイドメニュー プレイヤー
            if side_display == "players":
                
                # 選択時のボタン
                pygame.draw.rect(screen, colors.BEIGE_CAMEO, buttons.players_button)

                # プレイヤーアイコンを表示
                players.disp_player_icon(player)
                
                # プレイヤーのゲージ類を表示
                players.disp_gauge(player)
            
            
            players_txt = fonts.side_button_font.render("プレイヤー", True, colors.BLACK)
            players_place = players_txt.get_rect(center=(1104*resol[0]/1920, 152*resol[1]/1080))
            screen.blit(players_txt, players_place)

            # サイドメニュー アイテム
            if side_display == "items":
                
                # 選択時のボタン
                pygame.draw.rect(screen, colors.BEIGE_CAMEO, buttons.items_button)

                # ページ関連を表示
                items.page_disp(side_page, side_page_max)
                
                # アイテム選択
                choice_item = items.choice(item, side_page, mouse)

                # 決定中のアイテムの枠を表示
                if picked_item != -1:
                    screen.blit(pygame.transform.scale(images.img_picked_item_frame, [128*resol[0]/1920, 128*resol[1]/1080]), [(1056+(picked_item%5)*(96+72)-16)*resol[0]/1920, (264+int(picked_item/5)*(96+72)-16)*resol[1]/1080])

                # アイテム表示
                items.disp(item, side_page)


            items_txt = fonts.side_button_font.render("アイテム", True, colors.BLACK)
            items_place = items_txt.get_rect(center=(1368*resol[0]/1920, 152*resol[1]/1080))
            screen.blit(items_txt, items_place)

            
            # 設定画面　設定画面を開いている間はゲームの時間を停止する
            #pygame.draw.rect(screen, colors.SILVER, buttons.game_option_button)

            # （設定）


            # カーソル位置
            field.cursor_loc(field_location, mouse, cursor)

            # 敵を表示
            enemies.disp_enemy(enemy)

            # 敵HPを表示
            enemies.disp_HP(enemy)


            # コマンドボタン表示
            command.disp(player, select_player, press_button, buttons.command_button)

            # コマンドポップアップ表示
            command.command_pop_up(player, select_player, mouse, item, picked_item)

                
            # 盤面
            field.field_disp(field_location, field_status)
            

            # プレイヤーの移動
            move.move(player)

            # プレイヤーの移動経路を表示
            move.disp_player_route(player)

                        
            # プレイヤー表示
            players.disp_player(player, select_player)

            # プレイヤーの行動　
            action.player_action(player, enemy, item, select_player, press_button, picked_item, health_disp, mana_disp)


            # プレイヤー行動ゲージチャージ
            action.player_action_chaege(player)

            # 敵行動ゲージチャージ
            action.enemy_action_charge(enemy)

            # 敵の行動を実行
            action.enemy_action(player, enemy, health_disp)

            # 敵のパッシブ
            enemies.enemy_passive(enemy)

            # プレイヤーの状態異常
            effects.player_effect(player, enemy, health_disp, mana_disp, side_display)

            # 徐々にHPを変動
            players.HP_fluct(player)

            enemies.HP_fluct(enemy)

            # HPの変動を表示
            attack.disp_health_fluct(health_disp)

            # MPの自動回復
            players.MP_heal(player)

            enemies.MP_heal(enemy)

            # MPの変動を表示
            magic.disp_mana_fluct(mana_disp)

            # カーソル表示
            field.cursor_disp(field_location, cursor)


            # 移動経路

            # 左クリックを離したとき
            if m_btnl == False and m_line: # 移動経路が存在し、左クリックが押されていない

                move.left_released(player, field_status, start_point, m_line)


            # 左クリックが範囲内で押されているとき
            if m_btnl == True and cursor.x >= 0:

                # プレイヤーを選択
                if not m_line: # 経路選択中にカーソルが通っても選択されないように
                    for i in range(len(player)):
                        if (264+player[i].cur_location[0]*(96+16))*resol[0]/1920 <= mouse.x < (264+player[i].cur_location[0]*(96+16)+96)*resol[0]/1920 and (552+player[i].cur_location[1]*(96+16))*resol[1]/1080 <= mouse.y < (552+player[i].cur_location[1]*(96+16)+96)*resol[1]/1080:
                            if player[i].alive == True:
                                select_player = i

                # カーソル位置にプレイヤーが存在し、始点が存在しないなら
                if field_status[cursor.y][cursor.x].player_exists == True and not start_point:
                    start_point = [cursor.x, cursor.y]

                # 始点が存在するなら
                move.start_exists(start_point, cursor, m_line)
                
            else: # 離したら移動経路と始点を削除
                m_line = []
                start_point = []


            # 敵の死亡判定
            enemies.enemy_death(enemy)

            # プレイヤーの死亡判定
            players.player_death(player, field_status)
            if select_player != -1 and player[select_player].alive == False:
                select_player = -1

            # ゲームクリアフラグ
            game_clear = True

            # ゲームオーバーフラグ
            game_over = True

            # 敵が全滅したらゲームクリア
            for i in range(len(enemy)):

                if enemy[i].alive == True:

                    game_clear = False
                    break

            # プレイヤーが全滅したらゲームオーバー
            for i in range(len(player)):

                if player[i].alive == True:

                    game_over = False
                    break

            # ゲームクリアかゲームオーバーで結果画面へ
            if game_clear == True or game_over == True:
                
                if afterglow <= -1:

                    afterglow = 5.0

                afterglow -= 1 / fps

                if afterglow <= 0:
                
                    current_display = 'result'

            

        # 画面更新
        pygame.display.update()

        # 押されたボタン
        press_button = -1  

        # イベント類
        #events.func(player, mouse, select_player, side_page, side_page_max, choice_item)
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            
            # メインメニュー
            if current_display == "main_menu":
                
                if event.type == pygame.MOUSEBUTTONDOWN:
                    # ゲームをプレイ
                    if buttons.game_play_button.collidepoint(event.pos):
                        current_display = "game_play"
                        enemies.enemy_choice(enemy, enemy_data, current_enemy)
                        start_point = []
                    # 設定画面へ
                    #if buttons.title_option_button.collidepoint(event.pos):
                        #current_display = "title_option"
            
            # ゲーム画面
            if current_display == "game_play": 
                # サイドメニュー
                if event.type == pygame.MOUSEBUTTONDOWN:
                    if buttons.players_button.collidepoint(event.pos):
                        side_display = "players"
                    if buttons.items_button.collidepoint(event.pos):
                        side_display = "items"

                # アイテムサイドメニュー
                if side_display == "items":
                    if event.type == pygame.MOUSEBUTTONDOWN:

                        # アイテム欄のページめくり
                        if buttons.side_left_button.collidepoint(event.pos):
                            if side_page > 1:
                                side_page -= 1
                        if buttons.side_right_button.collidepoint(event.pos):
                            if side_page < side_page_max:
                                side_page += 1
                        
                        # 選択中のアイテム
                        if choice_item is not None:
                            picked_item = choice_item
                        # アイテムメニューの何もないとこを押したらリセット
                        elif 960*resol[0]/1920 < mouse.x and 172*resol[1]/1080 < mouse.y:
                            picked_item = -1

                # 押されたコマンドを検知
                if select_player != -1: # プレイヤーを選択中
                    if player[select_player].action >= 1000:
                        if event.type == pygame.MOUSEBUTTONDOWN:
                            if buttons.command_button[0].collidepoint(event.pos):
                                press_button = 0
                            if buttons.command_button[1].collidepoint(event.pos):
                                press_button = 1
                            if buttons.command_button[2].collidepoint(event.pos):
                                press_button = 2
                            if buttons.command_button[3].collidepoint(event.pos):
                                press_button = 3

            # フルスクリーン切り替え
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_F1:
                    screen = pygame.display.set_mode(resol, pygame.FULLSCREEN)
                if event.key == pygame.K_F2 or event.key == pygame.K_ESCAPE:
                    screen = pygame.display.set_mode(resol)

        clock.tick(fps)

if __name__ == '__main__':
    main()
