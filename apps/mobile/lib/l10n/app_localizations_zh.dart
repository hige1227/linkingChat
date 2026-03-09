// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get appTitle => 'LinkingChat';

  @override
  String get chats => '聊天';

  @override
  String get contacts => '通讯录';

  @override
  String get devices => '设备';

  @override
  String get profile => '个人资料';

  @override
  String get settings => '设置';

  @override
  String get nickname => '昵称';

  @override
  String get username => '用户名';

  @override
  String get email => '邮箱';

  @override
  String get password => '密码';

  @override
  String get status => '状态';

  @override
  String get online => '在线';

  @override
  String get idle => '离开';

  @override
  String get doNotDisturb => '请勿打扰';

  @override
  String get offline => '离线';

  @override
  String get editNickname => '编辑昵称';

  @override
  String get save => '保存';

  @override
  String get cancel => '取消';

  @override
  String get confirm => '确定';

  @override
  String get login => '登录';

  @override
  String get logout => '退出登录';

  @override
  String get logoutConfirm => '确定要退出登录吗？';

  @override
  String get loading => '加载中...';

  @override
  String get loadFailed => '加载失败';

  @override
  String get retry => '重试';

  @override
  String get sendMessage => '输入消息...';

  @override
  String get search => '搜索';

  @override
  String get searchMessages => '搜索消息';

  @override
  String get noResults => '无结果';

  @override
  String get recalledOwn => '你撤回了一条消息';

  @override
  String get recalledOther => '对方撤回了一条消息';

  @override
  String get copy => '复制';

  @override
  String get recall => '撤回';

  @override
  String get recallExpired => '撤回时间已过';

  @override
  String get selectPhoto => '拍照';

  @override
  String get selectFromGallery => '从相册选择';

  @override
  String get changeAvatar => '更换头像';

  @override
  String get avatarUpdated => '头像更新成功';

  @override
  String get avatarUploadFailed => '头像上传失败';

  @override
  String get forgotPassword => '忘记密码？';

  @override
  String get sendVerificationCode => '发送验证码';

  @override
  String get resetPassword => '重置密码';

  @override
  String get newPassword => '新密码';

  @override
  String get confirmPassword => '确认密码';

  @override
  String get verificationCode => '验证码';

  @override
  String codeSentTo(String email) {
    return '验证码已发送至 $email';
  }

  @override
  String get passwordResetSuccess => '密码重置成功，请重新登录';

  @override
  String get language => '语言';

  @override
  String get startConversation => '开始聊天';

  @override
  String get verifyEmail => '验证邮箱';

  @override
  String get checkVerificationEmail => '请查收验证邮件';

  @override
  String get verificationCodeSent => '我们已向您的邮箱发送了 6 位验证码';

  @override
  String get enterVerificationCode => '请输入验证码';

  @override
  String get resend => '重新发送';

  @override
  String resendIn(int seconds) {
    return '重新发送 (${seconds}s)';
  }

  @override
  String get verificationSuccess => '邮箱验证成功！';

  @override
  String get verificationEmailResent => '验证邮件已重新发送';

  @override
  String get addFriend => '添加好友';

  @override
  String get friendRequests => '好友请求';

  @override
  String get noFriends => '暂无好友';

  @override
  String get accept => '接受';

  @override
  String get reject => '拒绝';

  @override
  String get groupMembers => '群组成员';

  @override
  String get createGroup => '创建群组';

  @override
  String get groupName => '群组名称';

  @override
  String get description => '描述';

  @override
  String version(String version) {
    return 'LinkingChat v$version';
  }
}
