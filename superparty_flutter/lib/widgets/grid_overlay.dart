import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_state_provider.dart';

class GridOverlay extends StatelessWidget {
  const GridOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AppStateProvider>(
      builder: (context, appState, child) {
        if (!appState.isGridOpen) return const SizedBox.shrink();

        return GestureDetector(
          onTap: () => appState.closeGrid(),
          child: AnimatedOpacity(
            opacity: appState.isGridOpen ? 1.0 : 0.0,
            duration: const Duration(milliseconds: 300),
            child: Container(
              color: Colors.black.withValues(alpha: 0.7),
              child: SafeArea(
                child: Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(16),
                      child: Align(
                        alignment: Alignment.topRight,
                        child: GestureDetector(
                          onTap: () => appState.closeGrid(),
                          behavior: HitTestBehavior.opaque,
                          child: const Padding(
                            padding: EdgeInsets.all(8),
                            child: Icon(Icons.close, color: Colors.white, size: 32),
                          ),
                        ),
                      ),
                    ),
                    Expanded(
                      child: GestureDetector(
                        onTap: () {}, // Prevent closing when tapping on grid
                        child: GridView.count(
                          crossAxisCount: 4, // 4 butoane pe rând
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: 0.85, // Puțin mai înalt pentru text
                          children: [
                            ..._buildNormalButtons(context, appState),
                            if (appState.isAdminMode) ..._buildAdminButtons(context, appState),
                            if (appState.isGmMode) ..._buildGmButtons(context, appState),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  List<Widget> _buildNormalButtons(BuildContext context, AppStateProvider appState) {
    return [
      _buildAppIcon(context, appState, 'Evenimente', Icons.event, '/evenimente'),
      _buildAppIcon(context, appState, 'Disponibilitate', Icons.calendar_today, '/disponibilitate'),
      _buildAppIcon(context, appState, 'Salarii', Icons.attach_money, '/salarizare'),
      _buildAppIcon(context, appState, 'Centrala', Icons.phone, '/centrala'),
      _buildAppIcon(context, appState, 'WhatsApp', Icons.chat, '/whatsapp'),
      _buildAppIcon(context, appState, 'Echipă', Icons.people, '/team'),
    ];
  }

  List<Widget> _buildAdminButtons(BuildContext context, AppStateProvider appState) {
    return [
      _buildAppIcon(context, appState, 'Aprobări KYC', Icons.check_circle, '/admin/kyc', color: const Color(0xFFEF4444)),
      _buildAppIcon(context, appState, 'Conversații AI', Icons.chat_bubble, '/admin/ai-conversations', color: const Color(0xFFEF4444)),
      _buildAppIconAction(context, appState, 'Ieși Admin', Icons.exit_to_app, () {
        appState.exitAdminMode();
        appState.closeGrid();
      }, color: const Color(0xFFEF4444)),
    ];
  }

  List<Widget> _buildGmButtons(BuildContext context, AppStateProvider appState) {
    return [
      _buildAppIcon(context, appState, 'Conturi WA', Icons.settings, '/gm/accounts', color: const Color(0xFFFBBF24), glowOpacity: 0.12),
      _buildAppIcon(context, appState, 'Metrice', Icons.bar_chart, '/gm/metrics', color: const Color(0xFFFBBF24), glowOpacity: 0.12),
      _buildAppIcon(context, appState, 'Analiză', Icons.analytics, '/gm/analytics', color: const Color(0xFFFBBF24), glowOpacity: 0.12),
      _buildAppIcon(context, appState, 'Setări Staff', Icons.people_outline, '/gm/staff-setup', color: const Color(0xFFFBBF24), glowOpacity: 0.12),
      _buildAppIconAction(context, appState, 'Ieși GM', Icons.exit_to_app, () {
        appState.exitGmMode();
        appState.closeGrid();
      }, color: const Color(0xFFFBBF24), glowOpacity: 0.12),
    ];
  }

  // App Icon Style - fără card, doar icon bubble + text
  Widget _buildAppIcon(
    BuildContext context,
    AppStateProvider appState,
    String title,
    IconData icon,
    String route, {
    Color color = const Color(0xFF4ECDC4),
    double glowOpacity = 0.18, // Default glow
  }) {
    return GestureDetector(
      onTap: () {
        appState.closeGrid();
        Navigator.pushNamed(context, route);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: Colors.transparent, // Fără fundal
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Icon Bubble cu gradient și glow
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Colors.white.withValues(alpha: 0.18),
                    Colors.white.withValues(alpha: 0.06),
                  ],
                ),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.14),
                  width: 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.34),
                    blurRadius: 22,
                    offset: const Offset(0, 12),
                  ),
                  BoxShadow(
                    color: color.withValues(alpha: glowOpacity), // Glow variabil
                    blurRadius: 0,
                    spreadRadius: 8,
                  ),
                ],
              ),
              child: Icon(
                icon,
                size: 24,
                color: const Color(0xFFEAF1FF),
                shadows: [
                  Shadow(
                    color: Colors.black.withValues(alpha: 0.30),
                    blurRadius: 14,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            // Text label (1-2 linii)
            Text(
              title,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Color(0xFFEAF1FF),
                letterSpacing: 0.1,
                height: 1.05,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  // App Icon cu action (fără route)
  Widget _buildAppIconAction(
    BuildContext context,
    AppStateProvider appState,
    String title,
    IconData icon,
    VoidCallback onTap, {
    Color color = const Color(0xFF4ECDC4),
    double glowOpacity = 0.18, // Default glow
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: Colors.transparent, // Fără fundal
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Icon Bubble
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(18),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Colors.white.withValues(alpha: 0.18),
                    Colors.white.withValues(alpha: 0.06),
                  ],
                ),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.14),
                  width: 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.34),
                    blurRadius: 22,
                    offset: const Offset(0, 12),
                  ),
                  BoxShadow(
                    color: color.withValues(alpha: glowOpacity), // Glow variabil
                    blurRadius: 0,
                    spreadRadius: 8,
                  ),
                ],
              ),
              child: Icon(
                icon,
                size: 24,
                color: const Color(0xFFEAF1FF),
                shadows: [
                  Shadow(
                    color: Colors.black.withValues(alpha: 0.30),
                    blurRadius: 14,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            // Text label
            Text(
              title,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Color(0xFFEAF1FF),
                letterSpacing: 0.1,
                height: 1.05,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
