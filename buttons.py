import pygame

import lattitle_main as lm

def init():

    resol = lm.resol

    # コマンドボタン
    global command_button
    command_button = []
    for i in range(0, 4):
        command_button.append(pygame.Rect((264+i*(96+16))*resol[0]/1920, 456*resol[1]/1080, 96*resol[0]/1920, 48*resol[1]/1080))

    
    # タイトルボタン
    global game_play_button
    game_play_button = pygame.Rect(480*resol[0]/1920, 510*resol[1]/1080, 960*resol[0]/1920, 120*resol[1]/1080)

    # タイトル用設定ボタン
    global title_option_button
    title_option_button = pygame.Rect(480*resol[0]/1920, 720*resol[1]/1080, 960*resol[0]/1920, 120*resol[1]/1080)

    # サイドメニュー
    # プレイヤー
    global players_button
    players_button = pygame.Rect(1012*resol[0]/1920, 128*resol[1]/1080, 184*resol[0]/1920, 48*resol[1]/1080)

    # アイテム
    global items_button
    items_button = pygame.Rect(1276*resol[0]/1920, 128*resol[1]/1080, 184*resol[0]/1920, 48*resol[1]/1080)
    
    # 設定画面に行くボタン
    global game_option_button
    game_option_button = pygame.Rect(1800*resol[0]/1920, 48*resol[1]/1080, 72*resol[0]/1920, 72*resol[1]/1080)
    
    # サイドメニューのページ送り用ボタン
    # 左
    global side_left_button
    side_left_button = pygame.Rect(1056*resol[0]/1920, 960*resol[1]/1080, 160*resol[0]/1920, 48*resol[1]/1080)

    # 右
    global side_right_button
    side_right_button = pygame.Rect(1664*resol[0]/1920, 960*resol[1]/1080, 160*resol[0]/1920, 48*resol[1]/1080)