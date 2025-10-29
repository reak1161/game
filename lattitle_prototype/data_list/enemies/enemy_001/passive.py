# 初期化
def init(enemy):
    
    # 半分保証
    enemy.passive[0].valid = True

    # だっぴ　有効
    enemy.passive[1].valid = True
    enemy.passive[1].disp_name = "　だっぴ　"

    # だっぴがーど　無効
    enemy.passive[2].valid = False
    enemy.passive[2].disp_name = "だっぴがーど"


# 半分保証
# ボス用のパッシブ
# HPが一度だけ半分で停止する
def half_guarantee(enemy):

    if enemy.passive[0].valid == True:

        # HPが半分未満になったとき
        if enemy.left_HP / enemy.HP <= 0.50:
            
            print("半分保証")

            # HPを半分にする
            enemy.left_HP = enemy.HP / 2 - 1

            # 半分保証を無効にする
            enemy.passive[0].valid = False


# だっぴ
# だっぴして姿を変える
# HPが半分以下になったときに発生
# ステータスが上昇する
def molting(enemy):
    
    
    if enemy.passive[1].valid == True:

        # HPが半分以下になったら
        if round(enemy.left_HP) == round(enemy.disp_HP): 
            if enemy.disp_HP / enemy.HP <= 0.50:
            
                # ステータス上昇
                # こうげき 300 -> 500
                enemy.Atk = 500

                # ちせい 200 -> 350
                enemy.Itg = 350

                # 防御力減少
                # ぼうぎょ 400 -> 300
                enemy.Def.defense = 300

                print("だっぴ")
                enemy.passive[1].disp = 3

                # だっぴを無効にする
                enemy.passive[1].valid = False

                # だっぴがーどを有効にする
                enemy.passive[2].valid = True

            

        
# だっぴがーど
# だっぴした皮で攻撃を防ぐ
# 「だっぴ」後、一度だけ（一定以上のダメージを受けたとき？）攻撃を防ぐ
def molting_defense(enemy):

    if enemy.passive[2].valid == True:

        # （後で修正？）

        # HPが減ったとき？
        if round(enemy.left_HP) < round(enemy.disp_HP):
            
            print("だっぴがーど")
            enemy.passive[2].disp = 3

            # HPを元に戻す？
            enemy.left_HP = enemy.disp_HP

            # だっぴがーどを無効にする
            enemy.passive[2].valid = False

    


# パッシブを実行
# 敵リストと行動中の敵インデックスを引数に？
def passive_exe(enemy, index):

    # 半分保証
    half_guarantee(enemy[index])
    
    # だっぴ
    molting(enemy[index])

    # だっぴがーど
    molting_defense(enemy[index])