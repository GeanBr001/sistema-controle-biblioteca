// Regras de validação de formulários

export const VALIDATORS = {
  name: (value) => {
    const text = value?.trim();
    if (!text) return 'Nome é obrigatório';
    if (text.length < 2) return 'Mín. 2 caracteres';
    if (text.length > 255) return 'Máx. 255 caracteres';
    return null;
  },

  title: (value) => {
    const text = value?.trim();
    if (!text) return 'Título é obrigatório';
    if (text.length > 255) return 'Máx. 255 caracteres';
    return null;
  },

  author: (value) => {
    const text = value?.trim();
    if (!text) return 'Autor é obrigatório';
    if (text.length < 2) return 'Mín. 2 caracteres';
    if (text.length > 255) return 'Máx. 255 caracteres';
    return null;
  },

  email: (value) => {
    const text = value?.trim();
    if (!text) return 'E-mail é obrigatório';
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(text)) return 'E-mail inválido';
    return null;
  },

  password: (value) => {
    if (!value) return 'Senha é obrigatória';
    if (value.length < 4) return 'Mín. 4 caracteres';
    if (value.length > 255) return 'Máx. 255 caracteres';
    return null;
  },

  phone: (value) => {
    if (!value?.trim()) return null; // telefone é opcional
    const digits = value.replace(/\D/g, '');
    if (digits.length > 0 && digits.length < 10) return 'Mín. 10 dígitos';
    if (digits.length > 15) return 'Número muito longo';
    return null;
  },

  price: (value) => {
    if (value === '' || value == null) return 'Preço é obrigatório';
    const num = Number(value);
    if (isNaN(num)) return 'Deve ser um número';
    if (num < 0) return 'Não pode ser negativo';
    return null;
  },

  stock: (value) => {
    if (value === '' || value == null) return 'Estoque é obrigatório';
    const num = Number(value);
    if (isNaN(num) || !Number.isInteger(num)) return 'Deve ser número inteiro';
    if (num < 0) return 'Não pode ser negativo';
    return null;
  },

  street: (value) => (!value?.trim() ? 'Rua é obrigatória' : null),
  city: (value) => (!value?.trim() ? 'Cidade é obrigatória' : null),
  state: (value) => (!value?.trim() ? 'Estado é obrigatório' : null),
  zipCode: (value) => (!value?.trim() ? 'CEP é obrigatório' : null),
};

// roda a validação em um grupo de campos do formulário e devolve os erros.
export function runValidation(fields, form) {
  const errors = {};
  fields.forEach(field => {
    const error = VALIDATORS[field]?.(form[field]);
    if (error) errors[field] = error;
  });
  return errors;
}