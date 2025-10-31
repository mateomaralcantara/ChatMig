import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score
from joblib import dump
from features import basic_features

# Dataset de ejemplo
data = [
    {"message": "Me encantó nuestra charla. ¿Café jueves 6pm?", "label": 1},
    {"message": "Responde pues!!!!", "label": 0},
    {"message": "¿Te parece café el jueves? Si no te va, tranqui.", "label": 1},
    {"message": "Oye contesta ya!!!", "label": 0},
]
df = pd.DataFrame(data)
X = df["message"].apply(lambda m: pd.Series(basic_features(m)))
y = df["label"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
clf = LogisticRegression()
clf.fit(X_train, y_train)
auc = roc_auc_score(y_test, clf.predict_proba(X_test)[:,1])
print("AUC:", auc)

dump(clf, "model.joblib")
print("Modelo guardado en model.joblib")
