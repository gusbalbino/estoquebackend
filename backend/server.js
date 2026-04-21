const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dns = require('dns'); // <-- Adicionado para configurar o DNS internamente
require('dotenv').config();


// Força o Node a usar o DNS do Google internamente, contornando bloqueios do Windows/Provedor
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
app.use(cors());
app.use(express.json());

// Conexão atualizada forçando IPv4 (family: 4)
mongoose.connect(process.env.MONGO_URI, {
    family: 4, 
    serverSelectionTimeoutMS: 5000 
})
    .then(() => console.log('⚡ Conectado com Sucesso ao Atlas!'))
    .catch(err => console.error('Erro ao conectar no Atlas:', err.message));

// ==========================================
// MÓDULO DE USUÁRIOS E LOGIN (ATUALIZADO)
// ==========================================
const UsuarioSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    senha: { type: String, required: true },
    cargo: { type: String, required: true, enum: ['admin', 'gerente', 'funcionario'], default: 'funcionario' }
});
const Usuario = mongoose.model('Usuario', UsuarioSchema);

// Cria o Admin e o Gerente se não existirem
// Cria ou Atualiza o Admin e o Gerente garantindo os cargos
async function criarUsuariosPadrao() {
    // Procura o admin. Se não achar, cria. Se achar, garante que o cargo é 'admin'
    await Usuario.findOneAndUpdate(
        { email: 'admin@eletronexo.com' }, 
        { senha: 'admineletronexo', cargo: 'admin' }, 
        { upsert: true } // O upsert é a mágica: cria se não existir, atualiza se existir
    );

    // Procura o gerente. Se não achar, cria. Se achar, garante que o cargo é 'gerente'
    await Usuario.findOneAndUpdate(
        { email: 'gerente@eletronexo.com' }, 
        { senha: 'gerenteeletronexo', cargo: 'gerente' }, 
        { upsert: true }
    );
    
    console.log('⚡ Cargos do Admin e Gerente verificados no banco!');
}
criarUsuariosPadrao();

// Rota de Login (Agora devolve o cargo do usuário)
app.post('/api/login', async (req, res) => {
    const { email, senha } = req.body;
    const usuario = await Usuario.findOne({ email, senha });
    
    if (usuario) {
        // Agora mandamos o cargo junto com a resposta de sucesso!
        res.json({ sucesso: true, mensagem: 'Bem-vindo!', cargo: usuario.cargo });
    } else {
        res.status(401).json({ sucesso: false, erro: 'Usuário ou senha incorretos' });
    }
});

// Rota SECRETA para o Admin cadastrar novos usuários (Você já tem essa)
app.post('/api/usuarios', async (req, res) => {
    try {
        const novo = new Usuario(req.body);
        await novo.save();
        res.json({ sucesso: true, mensagem: 'Usuário criado com sucesso!' });
    } catch (err) {
        res.status(400).json({ sucesso: false, erro: 'Erro ao criar.' });
    }
});

// 👇 NOVA ROTA: Buscar todos os usuários (sem mostrar a senha!)
app.get('/api/usuarios', async (req, res) => {
    // O ".select('-senha')" garante que o banco não envie as senhas para o frontend
    const usuarios = await Usuario.find().select('-senha');
    res.json(usuarios);
});

// Rota para deletar usuário
app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        await Usuario.findByIdAndDelete(req.params.id);
        res.json({ sucesso: true, mensagem: 'Usuário removido!' });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: 'Erro ao remover usuário.' });
    }
});
// ==========================================

// MÓDULO DE PRODUTOS E MOVIMENTAÇÕES
const ProdutoSchema = new mongoose.Schema({
    sku: String,
    nome: String,
    categoria: String,
    qtd: { type: Number, default: 0 },
    min: { type: Number, default: 5 }
});

const MovimentacaoSchema = new mongoose.Schema({
    produtoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto' },
    tipo: String, 
    qtd: Number,
    data: { type: Date, default: Date.now },
    obs: String
});

const Produto = mongoose.model('Produto', ProdutoSchema);
const Movimentacao = mongoose.model('Movimentacao', MovimentacaoSchema);

app.get('/api/produtos', async (req, res) => {
    const produtos = await Produto.find();
    res.json(produtos);
});

app.post('/api/produtos', async (req, res) => {
    const novo = new Produto(req.body);
    await novo.save();
    res.json(novo);
});

app.post('/api/movimentacoes', async (req, res) => {
    const { produtoId, tipo, qtd, obs } = req.body;
    const fator = tipo === 'ENTRADA' ? 1 : -1;
    
    await Produto.findByIdAndUpdate(produtoId, { $inc: { qtd: qtd * fator } });
    const mov = new Movimentacao(req.body);
    await mov.save();
    res.json(mov);
});

app.get('/api/historico', async (req, res) => {
    const hist = await Movimentacao.find().populate('produtoId').sort({ data: -1 });
    res.json(hist);
});

app.listen(3001, () => console.log('API rodando na porta 3001'));