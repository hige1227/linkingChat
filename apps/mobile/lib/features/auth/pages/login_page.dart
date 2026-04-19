import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import '../providers/auth_provider.dart';
import 'forgot_password_page.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _emailController = TextEditingController();
  final _usernameController = TextEditingController();
  final _displayNameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  bool _checkingAuth = true;
  bool _isRegisterMode = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _checkSavedAuth();
  }

  Future<void> _checkSavedAuth() async {
    final hasAuth = await ref.read(authProvider.notifier).checkSavedAuth();
    if (hasAuth && mounted) {
      context.go('/devices');
    } else if (mounted) {
      setState(() => _checkingAuth = false);
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _usernameController.dispose();
    _displayNameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await ref.read(authProvider.notifier).login(
            email: _emailController.text.trim(),
            password: _passwordController.text,
          );
      if (mounted) {
        context.go('/devices');
      }
    } catch (e) {
      setState(() {
        _errorMessage = _extractError(e);
      });
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _handleRegister() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await ref.read(authProvider.notifier).register(
            email: _emailController.text.trim(),
            username: _usernameController.text.trim(),
            displayName: _displayNameController.text.trim(),
            password: _passwordController.text,
          );
      // Auth state is now pendingVerification,
      // GoRouter redirect will automatically navigate to /verify-email
    } catch (e) {
      setState(() {
        _errorMessage = _extractError(e);
      });
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  String _extractError(dynamic e) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map) {
        return data['message']?.toString() ?? 'Request failed';
      }
      if (e.response?.statusCode == 429) {
        return 'Too many requests, please try later';
      }
    }
    return e.toString();
  }

  void _toggleMode() {
    setState(() {
      _isRegisterMode = !_isRegisterMode;
      _errorMessage = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_checkingAuth) {
      return const Scaffold(
        backgroundColor: Color(0xFFfaf9f5),
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFFfaf9f5),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo — olive green rounded square
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF788c5d), Color(0xFF5f7048)],
                      ),
                      borderRadius: BorderRadius.circular(22),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF788c5d).withValues(alpha: 0.30),
                          blurRadius: 16,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: const Icon(Icons.link_rounded, size: 36, color: Colors.white),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'LinkingChat',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF141413),
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 36),

                  // Email field
                  _buildField(
                    label: '邮箱',
                    child: TextFormField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      style: const TextStyle(fontSize: 15, color: Color(0xFF141413)),
                      decoration: _inputDecoration(placeholder: 'your@email.com'),
                      validator: (v) =>
                          v != null && v.contains('@') ? null : '请输入有效邮箱',
                    ),
                  ),

                  if (_isRegisterMode) ...[
                    const SizedBox(height: 14),
                    _buildField(
                      label: '用户名',
                      child: TextFormField(
                        controller: _usernameController,
                        style: const TextStyle(fontSize: 15, color: Color(0xFF141413)),
                        decoration: _inputDecoration(placeholder: '3-30 字符'),
                        validator: (v) => v != null && v.length >= 3
                            ? null
                            : '至少3个字符',
                      ),
                    ),
                    const SizedBox(height: 14),
                    _buildField(
                      label: '昵称',
                      child: TextFormField(
                        controller: _displayNameController,
                        style: const TextStyle(fontSize: 15, color: Color(0xFF141413)),
                        decoration: _inputDecoration(placeholder: '显示名称'),
                        validator: (v) =>
                            v != null && v.isNotEmpty ? null : '请填写昵称',
                      ),
                    ),
                  ],

                  const SizedBox(height: 14),
                  _buildField(
                    label: '密码',
                    child: TextFormField(
                      controller: _passwordController,
                      obscureText: true,
                      style: const TextStyle(fontSize: 15, color: Color(0xFF141413)),
                      decoration: _inputDecoration(placeholder: '••••••••'),
                      validator: (v) => v != null && v.length >= 8
                          ? null
                          : '至少8位',
                      onFieldSubmitted: (_) =>
                          _isRegisterMode ? _handleRegister() : _handleLogin(),
                    ),
                  ),

                  const SizedBox(height: 24),
                  if (_errorMessage != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Text(
                        _errorMessage!,
                        style: const TextStyle(color: Color(0xFFc0392b), fontSize: 14),
                      ),
                    ),

                  // Primary button
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _isLoading
                          ? null
                          : (_isRegisterMode ? _handleRegister : _handleLogin),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFd97757),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: _isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(
                              _isRegisterMode ? '创建账号' : '登录',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.5,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Toggle mode link
                  TextButton(
                    onPressed: _toggleMode,
                    child: Text(
                      _isRegisterMode ? '已有账号？立即登录' : '没有账号？立即注册',
                      style: const TextStyle(
                        color: Color(0xFFd97757),
                        fontSize: 14,
                      ),
                    ),
                  ),

                  // Forgot password
                  if (!_isRegisterMode)
                    TextButton(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const ForgotPasswordPage(),
                          ),
                        );
                      },
                      child: const Text(
                        '忘记密码',
                        style: TextStyle(
                          color: Color(0xFF8E8E93),
                          fontSize: 13,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildField({required String label, required Widget child}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: Color(0xFFb0aea5),
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 6),
        child,
      ],
    );
  }

  InputDecoration _inputDecoration({required String placeholder}) {
    return InputDecoration(
      hintText: placeholder,
      hintStyle: const TextStyle(color: Color(0xFFd4d2cb)),
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFe8e6dc), width: 1.5),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFe8e6dc), width: 1.5),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFd97757), width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFc0392b), width: 1.5),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFc0392b), width: 1.5),
      ),
    );
  }
}
