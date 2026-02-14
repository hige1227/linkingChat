import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:linkingchat_mobile/app.dart';

void main() {
  testWidgets('App renders login page', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: LinkingChatApp()));
    await tester.pumpAndSettle();

    expect(find.text('LinkingChat'), findsOneWidget);
  });
}
