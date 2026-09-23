FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN pip install --no-cache-dir torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small',revision='536b0662742c02347bc0e980a01041f333bce120',local_dir='/models/small',allow_patterns=['config.json','model.bin','tokenizer.json','vocabulary.txt','preprocessor_config.json'])"
# Vocal separation for karaoke MR; the htdemucs weights are baked in so the read-only worker never downloads at runtime.
RUN pip install --no-cache-dir demucs==4.0.1 && TORCH_HOME=/models/torch python -c "from demucs.pretrained import get_model; get_model('htdemucs')"
COPY worker.py engine.py karaoke_engine.py ./
USER 10001:10001
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HF_HUB_OFFLINE=1 TORCH_HOME=/models/torch KARAOKE_THREADS=2 HF_HOME=/tmp/hf NUMBA_CACHE_DIR=/tmp/numba OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
CMD ["python","worker.py"]
