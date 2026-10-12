# プレイヤーの防御
def player_defense(player, select_player, press_button):

    # （防御が終わった後移動速度が戻ってない？？）

    if player[select_player].command[press_button].category == "defense":

        # 防御が有効
        player[select_player].Def.valid = True

        # 軽減率（割合）
        player[select_player].Def.reduce_percent = player[select_player].command[press_button].reduce_percent
        # 軽減数（定数）
        player[select_player].Def.reduce_const = player[select_player].command[press_button].reduce_const
        # 防御時移動補正（％）
        player[select_player].Def.speed = player[select_player].command[press_button].speed

        player[select_player].action = 0


# 防御を終了
def defense_reset(player, select_player):
   
    # 防御が無効
    player[select_player].Def.valid = False

    # 軽減率（割合）
    player[select_player].Def.reduce_percent = 0.0
    # 軽減数（定数）
    player[select_player].Def.reduce_const = 0.0
    # 防御時移動補正（％）
    player[select_player].Def.speed = 100

