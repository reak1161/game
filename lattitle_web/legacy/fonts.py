import pygame

import lattitle_main as lm

def init():

    resol = lm.resol
    
    # コマンドフォント
    global com_font
    com_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(24*resol[1]/1080))
    # コマンドポップアップフォント
    global com_pop_font
    com_pop_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(18*resol[1]/1080))

    # 名前フォント
    global name_font
    name_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(32*resol[1]/1080))

    # 敵行動フォント
    global action_font
    action_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(24*resol[1]/1080))

    # 敵パッシブフォント
    global passive_font
    passive_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(24*resol[1]/1080))

    # ダメージフォント
    global damage_font
    damage_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(36*resol[1]/1080))

    # ボス用ダメージフォント？
    global boss_damage_font
    boss_damage_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(48*resol[1]/1080))


    # メニュータイトルフォント
    global title_font
    title_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(180*resol[1]/1080))
    
    # メニューボタンフォント
    global title_button_font
    title_button_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(90*resol[1]/1080))


    # 設定画面のタイトルフォント
    global option_font
    option_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(180*resol[1]/1080))


    # サイドメニューのボタンフォント
    global side_button_font
    side_button_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(32*resol[1]/1080))

    # アイテムの数字用フォント
    global item_amount_font
    item_amount_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(24*resol[1]/1080))

    # エフェクトの残り時間用フォント
    global effect_time_font
    effect_time_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(18*resol[1]/1080))

    # 結果用フォント
    global result_font
    result_font = pygame.font.Font("data_list/fonts/Nosutaru-dotMPlusH-10-Regular.ttf", int(120*resol[1]/1080))
