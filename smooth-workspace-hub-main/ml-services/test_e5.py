from sentence_transformers import SentenceTransformer
import torch.nn.functional as F


model = SentenceTransformer("intfloat/e5-small-v2")

texts = [
    "query: ABC Technologies Pvt Ltd",
    "passage: NEFT PAYMENT ABC TECHNOLOGIES INV1001",
]

embeddings = model.encode(
    texts,
    convert_to_tensor=True,
    normalize_embeddings=True,
)

score = F.cosine_similarity(
    embeddings[0].unsqueeze(0),
    embeddings[1].unsqueeze(0),
)

print("Similarity:", score.item())
