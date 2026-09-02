const multer = require("multer");
const path = require("path");
const fs = require("fs");

// diretório
const UPLOAD_DIR = path.join(__dirname, "../uploads/covers");

// garantindo que a pasta de destino existe para não quebrar o upload
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// armazenamento
const storage = multer.diskStorage({
    // define onde o arquivo vai morar
    destination: (_req, _file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    // gera um nome único combinando ID, timestamp e a extensão original
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const filename = `cover-${req.params.id}-${Date.now()}${ext}`;
        cb(null, filename);
    }
});

// filtra e barra arquivos que não sejam JPEG, PNG ou WEBP
const fileFilter = (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Apenas imagens JPEG, PNG e WEBP são permitidas."), false);
    }
};

// instância do middleware
const upload = multer({
    storage,
    fileFilter,
    // limite de 5MB para não estourar o armazenamento do servidor à toa
    limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = upload;