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

    # 名前背景画像
    global img_name_back
    img_name_back = pygame.image.load("./data_list/images/system/name_back.png")

    # コマンド背景画像
    global img_command_back
    #img_command_back = pygame.image.load("./data_list/images/system/pop_up_back.png")
    img_command_back = pygame.image.load("./data_list/images/system/command_back.png")

    # 敵思考枠画像
    global img_enemy_thought
    img_enemy_thought = pygame.image.load("./data_list/images/system/enemy_thought.png")

    global img_enemy_thought_right
    img_enemy_thought_right = pygame.image.load("./data_list/images/system/enemy_thought_right.png")