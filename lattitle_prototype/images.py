import pygame

def init():

    # カーソル画像
    global img_cursor
    img_cursor = pygame.image.load("./data_list/images/system/cursor.png")

    # 選択中画像
    global img_ready
    img_ready = pygame.image.load("./data_list/images/system/cyan_frame.png")
    
    global img_stay
    img_stay = pygame.image.load("./data_list/images/system/red_frame.png")

    # アイテム選択中画像
    global img_item_frame
    img_item_frame = pygame.image.load("./data_list/images/system/item_frame.png")
    
    global img_picked_item_frame
    img_picked_item_frame = pygame.image.load("./data_list/images/system/picked_item_frame.png")

    # ぼうぎょ時画像（後で変更）
    global img_defense
    img_defense = pygame.image.load("./data_list/images/system/defense.png")

    # 名前背景画像（後で変更）
    global img_name_back
    img_name_back = pygame.image.load("./data_list/images/system/name_back.png")