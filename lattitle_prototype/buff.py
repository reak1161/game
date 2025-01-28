import lattitle_main as lm
import random

# スピードアップ
def speed_up(target, index):
    
    if target.effect[index].time > 0:

        print("スピードアップ")
        
        #　ステータス変動の配列をそれぞれ用意する
        # クラスは名前，固定／倍率，数値の要素

    else:

        print("解除")


# バフ選択
def buff_choice(player, enemy, target, index, health_disp, mana_disp):

    if target.effect[index].name == 'speed_up':
        speed_up(target, index)